import { randomInt } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { requireAccount } from './accounts.ts'
import { hasDatabase, query } from './database.ts'
import { getPresence } from './presence.ts'
import { allowAttempt, createJsonHandler, readBody, RequestError, sendJson } from './requests.ts'

const CODE_LENGTH = 8
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // sin letras y números fáciles de confundir
const MAX_FRIENDS = 200
const MAX_SENT_REQUESTS = 50
const MAX_REQUESTS_PER_WINDOW = 30 // por cuenta: frena a quien prueba códigos al azar
const UNIQUE_VIOLATION = '23505' // código de PostgreSQL

interface Person {
  id: string
  name: string
  username: string | null
}

function createFriendCode() {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return code
}

// Acepta el código con o sin guion, y en minúsculas
function parseFriendCode(value: unknown) {
  if (typeof value !== 'string') return null

  const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return code.length === CODE_LENGTH ? code : null
}

function parseId(value: unknown) {
  return typeof value === 'string' && /^\d{1,19}$/.test(value) ? value : null
}

// Las cuentas creadas antes de que hubiera amigos no tienen código: se les crea la primera vez
async function getFriendCode(accountId: string): Promise<string> {
  const { rows } = await query<{ friend_code: string | null }>('SELECT friend_code FROM users WHERE id = $1', [accountId])
  if (rows[0]?.friend_code) return rows[0].friend_code

  try {
    await query('UPDATE users SET friend_code = $1 WHERE id = $2 AND friend_code IS NULL', [createFriendCode(), accountId])
  } catch (error) {
    if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error
    // Otro ya tenía ese código: se prueba con uno nuevo
  }
  return getFriendCode(accountId)
}

async function listPeople(sql: string, accountId: string) {
  const { rows } = await query<Person>(sql, [accountId])
  return rows
}

async function loadFriends(accountId: string) {
  const [code, friends, received, sent] = await Promise.all([
    getFriendCode(accountId),
    listPeople(
      `SELECT users.id, users.name, users.username FROM friendships JOIN users ON users.id = friendships.friend_id
       WHERE friendships.user_id = $1 ORDER BY lower(users.name)`,
      accountId,
    ),
    listPeople(
      `SELECT users.id, users.name, users.username FROM friend_requests JOIN users ON users.id = friend_requests.from_id
       WHERE friend_requests.to_id = $1 ORDER BY friend_requests.created_at`,
      accountId,
    ),
    listPeople(
      `SELECT users.id, users.name, users.username FROM friend_requests JOIN users ON users.id = friend_requests.to_id
       WHERE friend_requests.from_id = $1 ORDER BY friend_requests.created_at`,
      accountId,
    ),
  ])

  return {
    code,
    friends: friends.map((friend) => ({ ...friend, presence: getPresence(friend.id) })),
    received,
    sent,
  }
}

async function countRows(sql: string, accountId: string) {
  const { rows } = await query<{ count: number }>(sql, [accountId])
  return rows[0].count
}

// Borra la solicitud y crea la amistad en las dos direcciones, en una sola operación
async function acceptRequest(accountId: string, fromId: string) {
  const { rowCount } = await query(
    `WITH accepted AS (
       DELETE FROM friend_requests WHERE from_id = $2 AND to_id = $1 RETURNING from_id
     )
     INSERT INTO friendships (user_id, friend_id)
     SELECT $1, $2 FROM accepted UNION ALL SELECT $2, $1 FROM accepted
     ON CONFLICT DO NOTHING`,
    [accountId, fromId],
  )
  return (rowCount ?? 0) > 0
}

async function sendRequest(accountId: string, body: Record<string, unknown>) {
  if (!allowAttempt(`friend:${accountId}`, MAX_REQUESTS_PER_WINDOW)) {
    throw new RequestError(429, 'Demasiados intentos. Prueba de nuevo en unos minutos.')
  }

  const code = parseFriendCode(body.code)
  if (!code) throw new RequestError(400, `El código de amigo tiene ${CODE_LENGTH} caracteres.`)

  const { rows } = await query<{ id: string }>('SELECT id FROM users WHERE friend_code = $1', [code])
  const friendId = rows[0]?.id
  if (!friendId) throw new RequestError(404, 'No hay nadie con ese código.')
  if (friendId === accountId) throw new RequestError(400, 'Ese es tu propio código.')

  const isFriend = await query('SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2', [accountId, friendId])
  if (isFriend.rows.length > 0) throw new RequestError(409, 'Ya son amigos.')

  // Si la otra persona ya te había invitado, enviar la tuya es aceptar la suya
  if (await acceptRequest(accountId, friendId)) return

  const friendCount = await countRows('SELECT count(*)::int AS count FROM friendships WHERE user_id = $1', accountId)
  if (friendCount >= MAX_FRIENDS) throw new RequestError(409, `Puedes tener hasta ${MAX_FRIENDS} amigos.`)

  const sentCount = await countRows('SELECT count(*)::int AS count FROM friend_requests WHERE from_id = $1', accountId)
  if (sentCount >= MAX_SENT_REQUESTS) {
    throw new RequestError(409, 'Tienes demasiadas solicitudes sin responder. Cancela alguna primero.')
  }

  const inserted = await query(
    'INSERT INTO friend_requests (from_id, to_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [accountId, friendId],
  )
  if (inserted.rowCount === 0) throw new RequestError(409, 'Ya le enviaste una solicitud.')
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const route = `${request.method} ${request.url?.split('?')[0]}`
  if (!hasDatabase()) throw new RequestError(503, 'Los amigos no están disponibles ahora.')

  const account = await requireAccount(request)
  if (route === 'GET /api/friends') {
    sendJson(response, 200, await loadFriends(account.id))
    return
  }

  const body = await readBody(request)
  const otherId = parseId(body.id)

  if (route === 'POST /api/friends/request') {
    await sendRequest(account.id, body)
  } else if (!otherId) {
    throw new RequestError(route.startsWith('POST /api/friends/') ? 400 : 404, 'No encontrado.')
  } else if (route === 'POST /api/friends/accept') {
    if (!(await acceptRequest(account.id, otherId))) throw new RequestError(404, 'Esa solicitud ya no existe.')
  } else if (route === 'POST /api/friends/decline') {
    await query('DELETE FROM friend_requests WHERE from_id = $1 AND to_id = $2', [otherId, account.id])
  } else if (route === 'POST /api/friends/cancel') {
    await query('DELETE FROM friend_requests WHERE from_id = $1 AND to_id = $2', [account.id, otherId])
  } else if (route === 'POST /api/friends/remove') {
    await query(
      'DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
      [account.id, otherId],
    )
  } else {
    throw new RequestError(404, 'No encontrado.')
  }

  // Cada cambio responde con la lista completa, así la página no tiene que adivinar cómo quedó
  sendJson(response, 200, await loadFriends(account.id))
}

export function createFriendsHandler() {
  return createJsonHandler('los amigos', handleRequest, 'Los amigos no están disponibles ahora.')
}
