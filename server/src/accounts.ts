import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { Resolver } from 'node:dns/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { OAuth2Client } from 'google-auth-library'
import { describeCharacter, parseCharacter } from './character.ts'
import { hasDatabase, query } from './database.ts'
import { allowAttempt, createJsonHandler, readBody, RequestError, sendJson } from './requests.ts'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null // vacía en el .env es lo mismo que no tenerla
const COOKIE_NAME = 'studyfocus_account'
const SESSION_DAYS = 30
const MAX_NAME_LENGTH = 20 // igual que el apodo de una sala
const MAX_EMAIL_LENGTH = 254
const MAX_LOCAL_PART_LENGTH = 64 // lo que va antes de la @
const DNS_TIMEOUT = 3000 // milisegundos
const MISSING_DOMAIN = ['ENOTFOUND', 'ENODATA', 'ENONAME'] // el dominio no existe, o no tiene esa dirección
// Lo que va antes de la @: letras, números y algunos signos, con puntos sueltos entre medio
const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/
const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const TOP_LEVEL_DOMAIN = /^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/ // .cl, .com; o uno con tildes ya convertido
const MIN_USERNAME_LENGTH = 3
const MAX_USERNAME_LENGTH = 20
// Empieza con una letra; después letras, números, guiones bajos y puntos sueltos
const USERNAME = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/
const RESERVED_USERNAMES = new Set(['admin', 'administrador', 'moderador', 'soporte', 'sistema', 'studyfocus', 'root'])
const NAME_CHANGE_DAYS = 30
const PROFILE_LIMITS = { bio: 300, studies: 80, institution: 80 } // caracteres
// Códigos de dos letras que Intl conoce pero no son países ni territorios
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ'])
const regionNames = new Intl.DisplayNames(['es'], { type: 'region', fallback: 'none' })
const DAY = 24 * 60 * 60 * 1000 // milisegundos
const UNIQUE_VIOLATION = '23505' // código de PostgreSQL
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128
const DEFAULT_NAME = 'Estudiante'
const SALT_SIZE = 16 // bytes
const KEY_SIZE = 32 // bytes
const SCRYPT_OPTIONS: ScryptOptions = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
const MAX_ATTEMPTS_PER_EMAIL = 10
const MAX_PASSWORD_CHECKS = 300 // entre todos: revisar una contraseña gasta mucha memoria y CPU

const UNAVAILABLE = 'Las cuentas no están disponibles ahora. Prueba de nuevo en unos minutos.'
const INVALID_NAME = `Escribe tu apodo, de hasta ${MAX_NAME_LENGTH} caracteres.`
const INVALID_USERNAME = `El nombre de usuario debe tener entre ${MIN_USERNAME_LENGTH} y ${MAX_USERNAME_LENGTH} caracteres: letras sin tildes, números, _ y puntos, empezando con una letra.`
const TAKEN_USERNAME = 'Ese nombre de usuario ya está ocupado.'
const TOO_MANY_ATTEMPTS = 'Demasiados intentos. Prueba de nuevo en unos minutos.'
const WRONG_LOGIN = 'El usuario o la contraseña no coinciden.'
const PROFILE_COLUMNS = 'users.id, users.bio, users.studies, users.institution, users.country, users.character_look'
const ACCOUNT_COLUMNS = `users.name, users.email, users.username, users.name_changed_at, ${PROFILE_COLUMNS}`

export interface Account {
  id: string
  name: string // el apodo, que ven los demás en la sala
  email: string | null // solo las cuentas locales: de Google no se guarda
  username: string | null // las cuentas creadas antes de que existiera lo eligen al entrar
  name_changed_at: Date | null
  bio: string | null
  studies: string | null
  institution: string | null
  country: string | null // código de dos letras, como CL
  character_look: unknown
}

type PublicPerson = Pick<Account, 'id' | 'name' | 'username' | 'bio' | 'studies' | 'institution' | 'country' | 'character_look'>

function describeProfile(person: PublicPerson) {
  return {
    name: person.name,
    username: person.username,
    bio: person.bio,
    studies: person.studies,
    institution: person.institution,
    country: person.country,
    character: describeCharacter(person.character_look, person.id),
  }
}

// Un texto opcional del perfil: vacío se guarda como nada, y largo es un error
function parseProfileText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new RequestError(400, 'Formato no válido.')

  const text = value.trim().replace(/\s*\n\s*\n\s*/g, '\n\n')
  if (text.length > maxLength) throw new RequestError(400, `Usa hasta ${maxLength} caracteres.`)
  return text || null
}

function parseCountry(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value) || NOT_COUNTRIES.has(value) || !regionNames.of(value)) {
    throw new RequestError(400, 'Elige un país de la lista.')
  }
  return value
}

// Lo que ve la página de su propia cuenta
function describeAccount(account: Account) {
  const nextNameChange = account.name_changed_at ? new Date(account.name_changed_at.getTime() + NAME_CHANGE_DAYS * DAY) : null
  return {
    name: account.name,
    email: account.email,
    username: account.username,
    profile: describeProfile(account),
    character: describeCharacter(account.character_look, account.id),
    nextNameChange: nextNameChange && nextNameChange > new Date() ? nextNameChange.toISOString() : null,
  }
}

function parseUsername(value: unknown) {
  if (typeof value !== 'string') return null

  const username = value.trim().replace(/^@/, '').toLowerCase()
  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) return null
  if (!USERNAME.test(username) || RESERVED_USERNAMES.has(username)) return null
  return username
}

function isUniqueViolation(error: unknown, constraint: string) {
  const { code, constraint: name } = error as { code?: string; constraint?: string }
  return code === UNIQUE_VIOLATION && name === constraint
}

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null
const resolver = new Resolver({ timeout: DNS_TIMEOUT, tries: 1 })
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

// Para crear una cuenta el correo debe tener una forma válida, no solo "algo@algo.algo"
function hasValidEmailFormat(email: string) {
  const at = email.lastIndexOf('@')
  const localPart = email.slice(0, at)
  const labels = email.slice(at + 1).split('.')

  return (
    localPart.length <= MAX_LOCAL_PART_LENGTH &&
    LOCAL_PART.test(localPart) &&
    labels.length >= 2 &&
    labels.every((label) => DOMAIN_LABEL.test(label)) &&
    TOP_LEVEL_DOMAIN.test(labels[labels.length - 1])
  )
}

function isMissing(error: unknown) {
  return MISSING_DOMAIN.includes((error as { code?: string }).code ?? '')
}

// El dominio debe poder recibir correos: tener servidores de correo, o al menos una dirección.
// Si el DNS no responde, no se bloquea a nadie por eso.
async function canReceiveMail(domain: string) {
  try {
    const servers = await resolver.resolveMx(domain)
    // "0 ." significa que el dominio declara que no recibe correos
    return servers.some((server) => server.exchange !== '' && server.exchange !== '.')
  } catch (error) {
    if (!isMissing(error)) return true
  }

  for (const resolve of [() => resolver.resolve4(domain), () => resolver.resolve6(domain)]) {
    try {
      await resolve()
      return true
    } catch (error) {
      if (!isMissing(error)) return true
    }
  }
  return false
}

function parsePassword(value: unknown) {
  if (typeof value !== 'string') return null
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) return null
  return value
}

function parseName(value: unknown) {
  if (typeof value !== 'string') return null

  const name = value.trim()
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null
  return name
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

// Recibe el encabezado Cookie, que llega igual en una petición y al conectarse por Socket.IO
export async function findAccount(cookieHeader: string | undefined): Promise<Account | null> {
  if (!hasDatabase()) return null

  const token = readCookie(cookieHeader)
  if (!token) return null

  const { rows } = await query<Account>(
    `SELECT ${ACCOUNT_COLUMNS} FROM account_sessions
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

// Las cuentas de Google y las locales nunca se unen solas: el correo local no está verificado,
// y unirlas por correo dejaría a cualquiera preparar una cuenta con el correo de otra persona.
async function register(body: Record<string, unknown>): Promise<Account> {
  const username = parseUsername(body.username)
  if (!username) throw new RequestError(400, INVALID_USERNAME)

  const name = parseName(body.name)
  if (!name) throw new RequestError(400, INVALID_NAME)

  const email = parseEmail(body.email)
  if (!email || !hasValidEmailFormat(email)) throw new RequestError(400, 'Escribe un correo válido, como nombre@gmail.com.')

  const password = parsePassword(body.password)
  if (!password) {
    throw new RequestError(400, `La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`)
  }
  if (!allowAttempt('passwords', MAX_PASSWORD_CHECKS)) throw new RequestError(429, TOO_MANY_ATTEMPTS)

  if (!(await canReceiveMail(email.slice(email.lastIndexOf('@') + 1)))) {
    throw new RequestError(400, 'Ese correo no puede recibir mensajes. Revisa que esté bien escrito.')
  }

  try {
    const { rows } = await query<Account>(
      `INSERT INTO users (name, email, password_hash, username) VALUES ($1, $2, $3, $4)
       RETURNING ${ACCOUNT_COLUMNS.replaceAll('users.', '')}`,
      [name, email, await hashPassword(password), username],
    )
    return rows[0]
  } catch (error) {
    if (isUniqueViolation(error, 'users_username_key')) throw new RequestError(409, TAKEN_USERNAME)
    if (isUniqueViolation(error, 'users_local_email')) throw new RequestError(409, 'Ya hay una cuenta con ese correo.')
    throw error
  }
}

// Se entra con el correo o con el nombre de usuario
async function logIn(body: Record<string, unknown>): Promise<Account> {
  const login = typeof body.login === 'string' ? body.login : body.email
  const isEmail = typeof login === 'string' && login.includes('@')
  const identifier = isEmail ? parseEmail(login) : parseUsername(login)
  const password = typeof body.password === 'string' ? body.password : null
  if (!identifier || !password || password.length > MAX_PASSWORD_LENGTH) throw new RequestError(401, WRONG_LOGIN)

  if (!allowAttempt(`login:${identifier}`, MAX_ATTEMPTS_PER_EMAIL) || !allowAttempt('passwords', MAX_PASSWORD_CHECKS)) {
    throw new RequestError(429, TOO_MANY_ATTEMPTS)
  }

  const { rows } = await query<Account & { password_hash: string }>(
    `SELECT ${ACCOUNT_COLUMNS}, users.password_hash FROM users
     WHERE ${isEmail ? 'users.email' : 'users.username'} = $1 AND users.password_hash IS NOT NULL`,
    [identifier],
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
     RETURNING ${ACCOUNT_COLUMNS.replaceAll('users.', '')}`,
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
    const account = await findAccount(request.headers.cookie)
    sendJson(response, 200, {
      isAvailable: hasDatabase(),
      googleClientId: hasDatabase() ? GOOGLE_CLIENT_ID : null,
      account: account ? describeAccount(account) : null,
    })
    return
  }

  // El apodo se cambia a lo más una vez cada 30 días. El primer cambio no espera.
  if (route === 'POST /api/account/name') {
    const account = await requireAccount(request)

    const name = parseName((await readBody(request)).name)
    if (!name) throw new RequestError(400, INVALID_NAME)
    if (name === account.name) {
      sendJson(response, 200, describeAccount(account))
      return
    }

    const { rows } = await query<Account>(
      `UPDATE users SET name = $1, name_changed_at = now()
       WHERE id = $2 AND (name_changed_at IS NULL OR name_changed_at <= now() - make_interval(days => $3))
       RETURNING ${ACCOUNT_COLUMNS.replaceAll('users.', '')}`,
      [name, account.id, NAME_CHANGE_DAYS],
    )
    if (!rows[0]) {
      const date = new Date(describeAccount(account).nextNameChange ?? Date.now())
      const formatted = date.toLocaleDateString('es', { day: 'numeric', month: 'long' })
      throw new RequestError(429, `Ya cambiaste tu apodo este mes. Podrás cambiarlo de nuevo el ${formatted}.`)
    }
    sendJson(response, 200, describeAccount(rows[0]))
    return
  }

  // Lo que cuentas de ti: todo es opcional
  if (route === 'POST /api/account/profile') {
    const account = await requireAccount(request)
    const body = await readBody(request)
    const values = [
      parseProfileText(body.bio, PROFILE_LIMITS.bio),
      parseProfileText(body.studies, PROFILE_LIMITS.studies),
      parseProfileText(body.institution, PROFILE_LIMITS.institution),
      parseCountry(body.country),
    ]

    const { rows } = await query<Account>(
      `UPDATE users SET bio = $1, studies = $2, institution = $3, country = $4 WHERE id = $5
       RETURNING ${ACCOUNT_COLUMNS.replaceAll('users.', '')}`,
      [...values, account.id],
    )
    sendJson(response, 200, describeAccount(rows[0]))
    return
  }

  // Cómo se ve tu personaje, y con él tu foto
  if (route === 'POST /api/account/character') {
    const account = await requireAccount(request)
    const character = parseCharacter(await readBody(request))

    const { rows } = await query<Account>(
      `UPDATE users SET character_look = $1 WHERE id = $2 RETURNING ${ACCOUNT_COLUMNS.replaceAll('users.', '')}`,
      [JSON.stringify(character), account.id],
    )
    sendJson(response, 200, describeAccount(rows[0]))
    return
  }

  // El perfil de otra persona, por ejemplo al hacer clic en ella dentro de una sala
  if (route === 'GET /api/profile') {
    await requireAccount(request)
    const username = parseUsername(new URL(request.url ?? '/', 'http://localhost').searchParams.get('usuario'))
    if (!username) throw new RequestError(404, 'No encontrado.')

    const { rows } = await query<PublicPerson>(
      `SELECT users.name, users.username, ${PROFILE_COLUMNS} FROM users WHERE users.username = $1`,
      [username],
    )
    if (!rows[0]) throw new RequestError(404, 'No encontrado.')
    sendJson(response, 200, describeProfile(rows[0]))
    return
  }

  // Las cuentas de antes, y las de Google, eligen su nombre de usuario una sola vez
  if (route === 'POST /api/account/username') {
    const account = await requireAccount(request)
    if (account.username) throw new RequestError(409, 'Tu nombre de usuario ya está elegido y no se puede cambiar.')

    const username = parseUsername((await readBody(request)).username)
    if (!username) throw new RequestError(400, INVALID_USERNAME)

    try {
      const { rows } = await query<Account>(
        `UPDATE users SET username = $1 WHERE id = $2 AND username IS NULL
         RETURNING ${ACCOUNT_COLUMNS.replaceAll('users.', '')}`,
        [username, account.id],
      )
      if (!rows[0]) throw new RequestError(409, 'Tu nombre de usuario ya está elegido y no se puede cambiar.')
      sendJson(response, 200, describeAccount(rows[0]))
    } catch (error) {
      if (isUniqueViolation(error, 'users_username_key')) throw new RequestError(409, TAKEN_USERNAME)
      throw error
    }
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
  sendJson(response, 200, describeAccount(account))
}

export function createAccountsHandler() {
  return createJsonHandler('las cuentas', handleRequest, UNAVAILABLE)
}

// Para las rutas que solo puede usar quien inició sesión
export async function requireAccount(request: IncomingMessage) {
  const account = await findAccount(request.headers.cookie)
  if (!account) throw new RequestError(401, 'Inicia sesión de nuevo.')
  return account
}
