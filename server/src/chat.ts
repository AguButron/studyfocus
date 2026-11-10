import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Server, Socket } from 'socket.io'
import { requireAccount } from './accounts.ts'
import { hasDatabase, query } from './database.ts'
import { allowAttempt, createJsonHandler, RequestError, sendJson } from './requests.ts'

// El chat entre amigos. Los mensajes se guardan en la base y llegan al instante por la conexión de cada
// pestaña: cada cuenta tiene su propio grupo en Socket.IO, así le llegan a todas sus pestañas abiertas.
// Solo se escribe a un amigo; si dejan de serlo, la conversación queda para leerla, pero no para escribir.
// Más adelante puede haber un chat por sala, con otro grupo de Socket.IO.

export const MAX_MESSAGE_LENGTH = 1000
const PAGE_SIZE = 50 // mensajes por vez al abrir una conversación o subir a ver los anteriores
const MAX_MESSAGES = 120 // por cuenta cada 15 minutos: frena a quien manda en ráfaga

export interface Message {
  id: string
  from: string
  to: string
  body: string
  createdAt: string
}

const MESSAGE_COLUMNS = `id::text, from_id::text AS "from", to_id::text AS "to", body, created_at AS "createdAt"`

// El grupo de Socket.IO de cada cuenta: ahí le llega todo lo del chat
export const accountRoom = (accountId: string) => `cuenta:${accountId}`

function parseId(value: unknown) {
  return typeof value === 'string' && /^\d{1,19}$/.test(value) ? value : null
}

export async function areFriends(accountId: string, otherId: string) {
  const { rows } = await query('SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2', [accountId, otherId])
  return rows.length > 0
}

// El último mensaje tuyo que la otra persona ya leyó: ahí va el "Visto"
async function findReadUpTo(accountId: string, otherId: string) {
  const { rows } = await query<{ id: string | null }>(
    'SELECT max(id)::text AS id FROM messages WHERE from_id = $1 AND to_id = $2 AND read_at IS NOT NULL',
    [accountId, otherId],
  )
  return rows[0].id
}

// Sin leer, por persona: para el número junto a Amigos y en cada conversación
export async function countUnread(accountId: string) {
  const { rows } = await query<{ from: string; count: number }>(
    `SELECT from_id::text AS "from", count(*)::int AS count FROM messages
     WHERE to_id = $1 AND read_at IS NULL GROUP BY from_id`,
    [accountId],
  )
  return new Map(rows.map((row) => [row.from, row.count]))
}

// Una página de la conversación, del más antiguo al más nuevo. before: el id del mensaje más antiguo que ya se ve
async function loadConversation(accountId: string, otherId: string, before: string | null) {
  const { rows } = await query<Message>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages
     WHERE ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1)) AND ($3::bigint IS NULL OR id < $3)
     ORDER BY id DESC LIMIT $4`,
    [accountId, otherId, before, PAGE_SIZE + 1],
  )
  const hasMore = rows.length > PAGE_SIZE
  return { messages: rows.slice(0, PAGE_SIZE).reverse(), hasMore }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (request.method !== 'GET' || url.pathname !== '/api/chat') throw new RequestError(404, 'No encontrado.')
  if (!hasDatabase()) throw new RequestError(503, 'El chat no está disponible ahora.')

  const account = await requireAccount(request)
  const otherId = parseId(url.searchParams.get('con'))
  if (!otherId) throw new RequestError(404, 'No encontrado.')
  const before = url.searchParams.get('antes')

  const [conversation, canWrite, readUpTo] = await Promise.all([
    loadConversation(account.id, otherId, before ? parseId(before) : null),
    areFriends(account.id, otherId),
    findReadUpTo(account.id, otherId),
  ])
  sendJson(response, 200, { ...conversation, canWrite, readUpTo })
}

export function createChatHandler() {
  return createJsonHandler('el chat', handleRequest, 'El chat no está disponible ahora.')
}

// Los avisos del chat de una pestaña con la sesión iniciada
export function setUpChatSocket(io: Server, socket: Socket, accountId: string) {
  // Enviar: solo a un amigo, con texto. Responde con el mensaje guardado, o con un error para mostrar
  socket.on('chat:send', async (raw: unknown, reply: unknown) => {
    if (typeof reply !== 'function') return
    const { to, body } = (raw ?? {}) as Record<string, unknown>
    const otherId = parseId(to)
    const text = typeof body === 'string' ? body.trim() : ''
    if (!otherId || !text) return reply({ error: 'Escribe un mensaje.' })
    if (text.length > MAX_MESSAGE_LENGTH) return reply({ error: `Usa hasta ${MAX_MESSAGE_LENGTH} caracteres.` })
    if (!allowAttempt(`chat:${accountId}`, MAX_MESSAGES)) {
      return reply({ error: 'Estás enviando demasiados mensajes. Espera unos minutos.' })
    }
    try {
      if (!(await areFriends(accountId, otherId))) return reply({ error: 'Solo puedes escribirles a tus amigos.' })
      const { rows } = await query<Message>(
        `INSERT INTO messages (from_id, to_id, body) VALUES ($1, $2, $3) RETURNING ${MESSAGE_COLUMNS}`,
        [accountId, otherId, text],
      )
      const message = rows[0]
      // A todas las pestañas de las dos personas, también a las otras pestañas de quien lo envió
      io.to([accountRoom(accountId), accountRoom(otherId)]).emit('chat:message', message)
      reply({ message })
    } catch (error) {
      console.error('No se pudo guardar el mensaje:', error)
      reply({ error: 'No se pudo enviar. Prueba de nuevo.' })
    }
  })

  // Leíste la conversación hasta un mensaje: a la otra persona le aparece el "Visto"
  socket.on('chat:read', async (raw: unknown) => {
    const { with: other, upTo } = (raw ?? {}) as Record<string, unknown>
    const otherId = parseId(other)
    const lastId = parseId(upTo)
    if (!otherId || !lastId) return
    try {
      const { rowCount } = await query(
        'UPDATE messages SET read_at = now() WHERE from_id = $1 AND to_id = $2 AND id <= $3 AND read_at IS NULL',
        [otherId, accountId, lastId],
      )
      // Tus otras pestañas también quitan el número de sin leer
      io.to(accountRoom(accountId)).emit('chat:unread', { from: otherId, count: 0 })
      if (rowCount) {
        const readUpTo = await findReadUpTo(otherId, accountId)
        io.to(accountRoom(otherId)).emit('chat:read', { by: accountId, upTo: readUpTo })
      }
    } catch (error) {
      console.error('No se pudo marcar como leído:', error)
    }
  })

  // Estás escribiendo: la otra persona ve "Escribiendo…" unos segundos. La página lo manda cada tanto, no en cada tecla
  socket.on('chat:typing', async (raw: unknown) => {
    const otherId = parseId((raw as Record<string, unknown> | null)?.to)
    if (!otherId || !allowAttempt(`typing:${accountId}`, MAX_MESSAGES * 4)) return
    try {
      if (await areFriends(accountId, otherId)) io.to(accountRoom(otherId)).emit('chat:typing', { from: accountId })
    } catch {
      // Si falla, solo no se ve "Escribiendo…"
    }
  })
}
