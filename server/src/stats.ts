import type { IncomingMessage, ServerResponse } from 'node:http'
import { requireAccount } from './accounts.ts'
import { hasDatabase, query } from './database.ts'
import { createJsonHandler, RequestError, sendJson } from './requests.ts'

const CHART_DAYS = 7
const MAX_STREAK_DAYS = 400
const MAX_COMPANIONS = 5
const MIN_SEGMENT = 1000 // milisegundos: menos que esto no vale la pena guardarlo
const DAY = 24 * 60 * 60 * 1000 // milisegundos
const TIME_ZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])

// Un tramo estudiado: el servidor lo mide con su propio reloj, no con lo que diga la página
export async function recordStudy(accountId: string, roomCode: string, startedAt: number, endedAt: number) {
  if (endedAt - startedAt < MIN_SEGMENT) return

  await query(
    `INSERT INTO study_segments (user_id, room_code, started_at, ended_at)
     VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0))`,
    [accountId, roomCode, startedAt, endedAt],
  )
}

// Quiénes estudiaban en la misma sala y al mismo tiempo, y cuánto rato coincidieron
export async function findCompanions(accountId: string, since: number, roomCode: string | null = null) {
  const { rows } = await query<{ name: string; seconds: number }>(
    `SELECT users.name,
       sum(extract(epoch FROM least(mine.ended_at, theirs.ended_at) - greatest(mine.started_at, theirs.started_at)))::int AS seconds
     FROM study_segments mine
     JOIN study_segments theirs ON theirs.room_code = mine.room_code AND theirs.user_id <> mine.user_id
       AND theirs.started_at < mine.ended_at AND theirs.ended_at > mine.started_at
     JOIN users ON users.id = theirs.user_id
     WHERE mine.user_id = $1 AND mine.ended_at > to_timestamp($2 / 1000.0)
       AND ($3::text IS NULL OR mine.room_code = $3)
     GROUP BY users.id, users.name
     ORDER BY seconds DESC
     LIMIT $4`,
    [accountId, since, roomCode, MAX_COMPANIONS],
  )
  return rows
}

function previousDay(day: string) {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY).toISOString().slice(0, 10)
}

// Los días seguidos con estudio hasta hoy. Si hoy todavía no estudias, la racha de ayer sigue viva.
function countStreak(daysWithStudy: Set<string>, today: string) {
  let day = daysWithStudy.has(today) ? today : previousDay(today)
  let streak = 0
  while (daysWithStudy.has(day)) {
    streak++
    day = previousDay(day)
  }
  return streak
}

// Los días se cuentan en la zona horaria de la persona: estudiar a las 23:30 es de ese día, no del siguiente
async function loadStats(accountId: string, timeZone: string) {
  const [todayResult, daysResult, totalResult, companions] = await Promise.all([
    query<{ today: string }>('SELECT (now() AT TIME ZONE $1)::date::text AS today', [timeZone]),
    query<{ day: string; seconds: number }>(
      `SELECT (started_at AT TIME ZONE $2)::date::text AS day,
         sum(extract(epoch FROM ended_at - started_at))::int AS seconds
       FROM study_segments WHERE user_id = $1
       GROUP BY day ORDER BY day DESC LIMIT $3`,
      [accountId, timeZone, MAX_STREAK_DAYS],
    ),
    query<{ seconds: number }>(
      'SELECT coalesce(sum(extract(epoch FROM ended_at - started_at)), 0)::int AS seconds FROM study_segments WHERE user_id = $1',
      [accountId],
    ),
    findCompanions(accountId, Date.now() - CHART_DAYS * DAY),
  ])

  const today = todayResult.rows[0].today
  const secondsByDay = new Map(daysResult.rows.map((row) => [row.day, row.seconds]))

  const days: { date: string; seconds: number }[] = []
  for (let day = today, i = 0; i < CHART_DAYS; i++, day = previousDay(day)) {
    days.unshift({ date: day, seconds: secondsByDay.get(day) ?? 0 })
  }

  return {
    today: secondsByDay.get(today) ?? 0,
    week: days.reduce((sum, day) => sum + day.seconds, 0),
    total: totalResult.rows[0].seconds,
    streak: countStreak(new Set(secondsByDay.keys()), today),
    days,
    companions,
  }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (request.method !== 'GET' || url.pathname !== '/api/stats') throw new RequestError(404, 'No encontrado.')
  if (!hasDatabase()) throw new RequestError(503, 'Las estadísticas no están disponibles ahora.')

  const account = await requireAccount(request)
  const timeZone = url.searchParams.get('tz') ?? 'UTC'
  sendJson(response, 200, await loadStats(account.id, TIME_ZONES.has(timeZone) ? timeZone : 'UTC'))
}

export function createStatsHandler() {
  return createJsonHandler('las estadísticas', handleRequest, 'Las estadísticas no están disponibles ahora.')
}
