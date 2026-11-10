import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseUsername, requireAccount } from './accounts.ts'
import { describeCharacter } from './character.ts'
import { hasDatabase, query } from './database.ts'
import { getPresence, isConnected } from './presence.ts'
import { createJsonHandler, RequestError, sendJson } from './requests.ts'
import { loadStats, TIME_ZONES } from './stats.ts'

// La página del perfil de una persona: lo que cuenta de sí misma, cuánto ha estudiado y si son amigos.
// Se abre, por ejemplo, desde su nombre en la tarjeta que aparece al hacer clic en ella dentro de una sala.

interface PersonRow {
  id: string
  name: string
  username: string
  bio: string | null
  studies: string | null
  institution: string | null
  country: string | null
  character_look: unknown
  member_since: string
  last_seen: string | null
}

type Relation = 'self' | 'friend' | 'sent' | 'received' | 'none'

async function findRelation(accountId: string, otherId: string): Promise<Relation> {
  if (accountId === otherId) return 'self'
  const { rows } = await query<{ relation: Relation }>(
    `SELECT CASE
       WHEN EXISTS (SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2) THEN 'friend'
       WHEN EXISTS (SELECT 1 FROM friend_requests WHERE from_id = $1 AND to_id = $2) THEN 'sent'
       WHEN EXISTS (SELECT 1 FROM friend_requests WHERE from_id = $2 AND to_id = $1) THEN 'received'
       ELSE 'none' END AS relation`,
    [accountId, otherId],
  )
  return rows[0].relation
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (request.method !== 'GET' || url.pathname !== '/api/perfil') throw new RequestError(404, 'No encontrado.')
  if (!hasDatabase()) throw new RequestError(503, 'Los perfiles no están disponibles ahora.')

  const account = await requireAccount(request)
  const username = parseUsername(url.searchParams.get('usuario'))
  if (!username) throw new RequestError(404, 'No hay nadie con ese nombre de usuario.')

  const { rows } = await query<PersonRow>(
    `SELECT id::text, name, username, bio, studies, institution, country, character_look,
       to_char(created_at, 'YYYY-MM-DD') AS member_since, last_seen_at AS last_seen
     FROM users WHERE username = $1`,
    [username],
  )
  const person = rows[0]
  if (!person) throw new RequestError(404, 'No hay nadie con ese nombre de usuario.')

  // Los días de la racha se cuentan en la zona horaria de quien mira
  const timeZone = url.searchParams.get('tz') ?? 'UTC'
  const [stats, relation] = await Promise.all([
    loadStats(person.id, TIME_ZONES.has(timeZone) ? timeZone : 'UTC'),
    findRelation(account.id, person.id),
  ])

  sendJson(response, 200, {
    id: person.id,
    name: person.name,
    username: person.username,
    bio: person.bio,
    studies: person.studies,
    institution: person.institution,
    country: person.country,
    character: describeCharacter(person.character_look, person.id),
    memberSince: person.member_since,
    stats: { total: stats.total, week: stats.week, streak: stats.streak, days: stats.days },
    relation,
    // Dónde está ahora, solo para sus amigos (como en la lista de Amigos)
    presence: relation === 'friend' || relation === 'self' ? getPresence(person.id) : null,
    lastSeen: relation === 'friend' && !isConnected(person.id) ? person.last_seen : null,
  })
}

export function createProfilesHandler() {
  return createJsonHandler('el perfil', handleRequest, 'Los perfiles no están disponibles ahora.')
}
