import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import { OAuth2Client } from 'google-auth-library'
import { hasDatabase, query } from './database.ts'
import { listRooms } from './savedRooms.ts'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? null
const COOKIE_NAME = 'studyfocus_account'
const SESSION_DAYS = 30
const MAX_BODY_SIZE = 8192 // bytes, un token de Google cabe de sobra
const MAX_NAME_LENGTH = 20 // igual que el apodo de una sala
const MAX_EMAIL_LENGTH = 254
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128
const DEFAULT_NAME = 'Estudiante'
const SALT_SIZE = 16 // bytes
const KEY_SIZE = 32 // bytes
const SCRYPT_OPTIONS: ScryptOptions = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
const ATTEMPT_WINDOW = 15 * 60 * 1000 // milisegundos
const MAX_ATTEMPTS_PER_EMAIL = 10
const MAX_PASSWORD_CHECKS = 300 // entre todos: revisar una contraseña gasta mucha memoria y CPU

const UNAVAILABLE = 'Las cuentas no están disponibles ahora. Puedes entrar con tu apodo.'
const TOO_MANY_ATTEMPTS = 'Demasiados intentos. Prueba de nuevo en unos minutos.'
const WRONG_LOGIN = 'El correo o la contraseña no coinciden.'

interface Account {
  id: string
  name: string
}

class RequestError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null
const attempts = new Map<string, { count: number; resetAt: number }>()

function allowAttempt(key: string, max: number) {
  const now = Date.now()
  for (const [otherKey, attempt] of attempts) {
    if (attempt.resetAt <= now) attempts.delete(otherKey)
  }

  const attempt = attempts.get(key) ?? { count: 0, resetAt: now + ATTEMPT_WINDOW }
  attempt.count++
  attempts.set(key, attempt)
  return attempt.count <= max
}

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_SIZE, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

async function hashPassword(password: string) {
  const salt = randomBytes(SALT_SIZE)
  const key = await deriveKey(password, salt)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

async function isCorrectPassword(password: string, stored: string) {
  const [salt, key] = stored.split(':').map((part) => Buffer.from(part, 'hex'))
  return timingSafeEqual(await deriveKey(password, salt), key)
}

// Para un correo sin cuenta: tarda lo mismo, así la demora no revela qué correos existen
const FAKE_PASSWORD_HASH = await hashPassword(randomBytes(KEY_SIZE).toString('hex'))

function parseEmail(value: unknown) {
  if (typeof value !== 'string') return null

  const email = value.trim().toLowerCase()
  if (email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

function parsePassword(value: unknown) {
  if (typeof value !== 'string') return null
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) return null
  return value
}

function createName(value: string | undefined) {
  return value?.trim().slice(0, MAX_NAME_LENGTH).trim() || DEFAULT_NAME
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function readCookie(cookieHeader: string | undefined) {
  for (const cookie of cookieHeader?.split(';') ?? []) {
    const [name, value] = cookie.trim().split('=')
    if (name === COOKIE_NAME) return value
  }
  return null
}

function writeCookie(request: IncomingMessage, response: ServerResponse, value: string, maxAge: number) {
  const isHttps = request.headers['x-forwarded-proto'] === 'https' // el hosting atiende el HTTPS
  const secure = isHttps ? '; Secure' : ''
  response.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  )
}

// Solo acepta JSON: otro sitio no puede enviarlo con la cookie de la persona sin que el navegador lo bloquee
async function readBody(request: IncomingMessage) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new RequestError(415, 'Formato no válido.')
  }

  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > MAX_BODY_SIZE) throw new RequestError(413, 'Mensaje demasiado grande.')
  }

  try {
    const parsed: unknown = JSON.parse(body)
    return (parsed ?? {}) as Record<string, unknown>
  } catch {
    throw new RequestError(400, 'Formato no válido.')
  }
}

// Recibe el encabezado Cookie, que llega igual en una petición y al conectarse por Socket.IO
export async function findAccount(cookieHeader: string | undefined): Promise<Account | null> {
  if (!hasDatabase()) return null

  const token = readCookie(cookieHeader)
  if (!token) return null

  const { rows } = await query<Account>(
    `SELECT users.id, users.name FROM account_sessions
     JOIN users ON users.id = account_sessions.user_id
     WHERE token_hash = $1 AND expires_at > now()`,
    [hashToken(token)],
  )
  return rows[0] ?? null
}

async function startSession(request: IncomingMessage, response: ServerResponse, account: Account) {
  await query('DELETE FROM account_sessions WHERE expires_at <= now()')

  const token = randomBytes(KEY_SIZE).toString('hex')
  await query(
    `INSERT INTO account_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))`,
    [hashToken(token), account.id, SESSION_DAYS],
  )
  writeCookie(request, response, token, SESSION_DAYS * 24 * 60 * 60)
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

// Las cuentas de Google y las locales nunca se unen solas: el correo local no está verificado,
// y unirlas por correo dejaría a cualquiera preparar una cuenta con el correo de otra persona.
async function register(body: Record<string, unknown>): Promise<Account> {
  const email = parseEmail(body.email)
  if (!email) throw new RequestError(400, 'Escribe un correo válido.')

  const password = parsePassword(body.password)
  if (!password) {
    throw new RequestError(400, `La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`)
  }
  if (!allowAttempt('passwords', MAX_PASSWORD_CHECKS)) throw new RequestError(429, TOO_MANY_ATTEMPTS)

  const { rows } = await query<Account>(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) WHERE password_hash IS NOT NULL DO NOTHING
     RETURNING id, name`,
    [createName(email.split('@')[0]), email, await hashPassword(password)],
  )
  if (!rows[0]) throw new RequestError(409, 'Ya hay una cuenta con ese correo.')
  return rows[0]
}

async function logIn(body: Record<string, unknown>): Promise<Account> {
  const email = parseEmail(body.email)
  const password = typeof body.password === 'string' ? body.password : null
  if (!email || !password || password.length > MAX_PASSWORD_LENGTH) throw new RequestError(401, WRONG_LOGIN)

  if (!allowAttempt(`login:${email}`, MAX_ATTEMPTS_PER_EMAIL) || !allowAttempt('passwords', MAX_PASSWORD_CHECKS)) {
    throw new RequestError(429, TOO_MANY_ATTEMPTS)
  }

  const { rows } = await query<Account & { password_hash: string }>(
    'SELECT id, name, password_hash FROM users WHERE email = $1 AND password_hash IS NOT NULL',
    [email],
  )
  const isCorrect = await isCorrectPassword(password, rows[0]?.password_hash ?? FAKE_PASSWORD_HASH)
  if (!rows[0] || !isCorrect) throw new RequestError(401, WRONG_LOGIN)
  return rows[0]
}

async function logInWithGoogle(body: Record<string, unknown>): Promise<Account> {
  if (!googleClient || !GOOGLE_CLIENT_ID) throw new RequestError(503, UNAVAILABLE)
  if (typeof body.credential !== 'string') throw new RequestError(400, 'Formato no válido.')

  let payload
  try {
    // Revisa la firma, el vencimiento, quién lo emitió y que sea para esta aplicación
    const ticket = await googleClient.verifyIdToken({ idToken: body.credential, audience: GOOGLE_CLIENT_ID })
    payload = ticket.getPayload()
  } catch {
    throw new RequestError(401, 'Google no pudo confirmar tu cuenta.')
  }
  if (!payload) throw new RequestError(401, 'Google no pudo confirmar tu cuenta.')

  const { rows } = await query<Account>(
    `INSERT INTO users (name, google_sub) VALUES ($1, $2)
     ON CONFLICT (google_sub) DO UPDATE SET google_sub = EXCLUDED.google_sub
     RETURNING id, name`,
    [createName(payload.name), payload.sub],
  )
  return rows[0]
}

async function logOut(request: IncomingMessage, response: ServerResponse) {
  const token = readCookie(request.headers.cookie)
  if (token) {
    await query('DELETE FROM account_sessions WHERE token_hash = $1', [hashToken(token)])
  }
  writeCookie(request, response, '', 0)
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const route = `${request.method} ${request.url?.split('?')[0]}`

  if (route === 'GET /api/account') {
    sendJson(response, 200, {
      isAvailable: hasDatabase(),
      googleClientId: hasDatabase() ? GOOGLE_CLIENT_ID : null,
      name: (await findAccount(request.headers.cookie))?.name ?? null,
    })
    return
  }

  if (route === 'GET /api/account/rooms') {
    const account = await findAccount(request.headers.cookie)
    sendJson(response, 200, { rooms: account ? await listRooms(account.id) : [] })
    return
  }

  const actions: Record<string, ((body: Record<string, unknown>) => Promise<Account>) | undefined> = {
    'POST /api/account/register': register,
    'POST /api/account/login': logIn,
    'POST /api/account/google': logInWithGoogle,
  }
  const action = actions[route]

  if (route !== 'POST /api/account/logout' && !action) throw new RequestError(404, 'No encontrado.')
  if (!hasDatabase()) throw new RequestError(503, UNAVAILABLE)

  const body = await readBody(request)
  if (!action) {
    await logOut(request, response)
    sendJson(response, 200, {})
    return
  }

  const account = await action(body)
  await startSession(request, response, account)
  sendJson(response, 200, { name: account.name })
}

export function createAccountsHandler(): RequestListener {
  return (request, response) => {
    handleRequest(request, response).catch((error: unknown) => {
      if (error instanceof RequestError) {
        sendJson(response, error.status, { error: error.message })
        return
      }
      console.error('Error en las cuentas:', error)
      sendJson(response, 503, { error: UNAVAILABLE })
    })
  }
}
