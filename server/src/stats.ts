import type { IncomingMessage, ServerResponse } from 'node:http'
import { requireAccount } from './accounts.ts'
import { hasDatabase, query } from './database.ts'
import { createJsonHandler, RequestError, sendJson } from './requests.ts'

const CHART_DAYS = 7
const MAX_STREAK_DAYS = 400
const MAX_COMPANIONS = 5
const MIN_SEGMENT = 1000 // milisegundos: menos que esto no vale la pena guardarlo
const DAY = 24 * 60 * 60 * 1000 // milisegundos
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_YEARS = 30
// Cómo se agrupan las barras según el largo del período: por día, por semana, por mes o por año
const DAILY_UP_TO = 31 // días
const WEEKLY_UP_TO = 190 // días
const MONTHLY_UP_TO = 36 // meses
export const TIME_ZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])

// Un tramo estudiado: el servidor lo mide con su propio reloj, no con lo que diga la página
// El apartado solo se anota si es de la misma cuenta
export async function recordStudy(
  accountId: string,
  roomCode: string,
  startedAt: number,
  endedAt: number,
  sectionId: string | null = null,
) {
  if (endedAt - startedAt < MIN_SEGMENT) return

  await query(
    `INSERT INTO study_segments (user_id, room_code, started_at, ended_at, section_id)
     VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0),
       (SELECT id FROM sections WHERE id = $5::bigint AND user_id = $1))`,
    [accountId, roomCode, startedAt, endedAt, sectionId],
  )
}

// Quiénes estudiaban en la misma sala y al mismo tiempo, y cuánto rato coincidieron
export async function findCompanions(accountId: string, since: number, roomCode: string | null = null, until: number | null = null) {
  const { rows } = await query<{ name: string; seconds: number }>(
    `SELECT users.name,
       sum(extract(epoch FROM least(mine.ended_at, theirs.ended_at) - greatest(mine.started_at, theirs.started_at)))::int AS seconds
     FROM study_segments mine
     JOIN study_segments theirs ON theirs.room_code = mine.room_code AND theirs.user_id <> mine.user_id
       AND theirs.started_at < mine.ended_at AND theirs.ended_at > mine.started_at
     JOIN users ON users.id = theirs.user_id
     WHERE mine.user_id = $1 AND mine.ended_at > to_timestamp($2 / 1000.0)
       AND ($3::text IS NULL OR mine.room_code = $3)
       AND ($5::float8 IS NULL OR mine.started_at < to_timestamp($5 / 1000.0))
     GROUP BY users.id, users.name
     ORDER BY seconds DESC
     LIMIT $4`,
    [accountId, since, roomCode, MAX_COMPANIONS, until],
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
export async function loadStats(accountId: string, timeZone: string) {
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

// ── Un período cualquiera ─────────────────────────────────────────────

type Bucket = 'day' | 'week' | 'month' | 'year'

function parseDate(value: string | null) {
  if (!value || !DATE.test(value)) return null
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value ? null : value
}

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)

function chooseBucket(from: string, to: string): Bucket {
  const days = daysBetween(from, to) + 1
  if (days <= DAILY_UP_TO) return 'day'
  if (days <= WEEKLY_UP_TO) return 'week'
  const months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1
  return months <= MONTHLY_UP_TO ? 'month' : 'year'
}

// El comienzo del tramo al que pertenece un día: el lunes de su semana, el primero de su mes o de su año
function bucketStart(day: string, bucket: Bucket) {
  if (bucket === 'day') return day
  if (bucket === 'month') return `${day.slice(0, 7)}-01`
  if (bucket === 'year') return `${day.slice(0, 4)}-01-01`
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7 // lunes = 0
  return addDays(day, -weekday)
}

function nextBucket(start: string, bucket: Bucket) {
  if (bucket === 'day') return addDays(start, 1)
  if (bucket === 'week') return addDays(start, 7)
  const date = new Date(`${start}T00:00:00Z`)
  if (bucket === 'month') date.setUTCMonth(date.getUTCMonth() + 1)
  else date.setUTCFullYear(date.getUTCFullYear() + 1)
  return date.toISOString().slice(0, 10)
}

// from y to son días del calendario de la persona (ambos incluidos). from nulo: desde que empezó a estudiar
export async function loadRangeStats(accountId: string, timeZone: string, fromParam: string | null, toParam: string) {
  let from = fromParam
  if (!from) {
    const { rows } = await query<{ first: string | null }>(
      'SELECT (min(started_at) AT TIME ZONE $2)::date::text AS first FROM study_segments WHERE user_id = $1',
      [accountId, timeZone],
    )
    from = rows[0].first ?? toParam
  }
  const to = toParam
  if (from > to) throw new RequestError(400, 'La fecha de inicio debe ser antes que la de término.')
  if (daysBetween(from, to) > MAX_RANGE_YEARS * 366) throw new RequestError(400, 'Elige un período más corto.')

  // Los límites del período en la hora de la persona, como instantes
  const { rows: bounds } = await query<{ since: number; until: number }>(
    `SELECT (extract(epoch FROM ($2::date)::timestamp AT TIME ZONE $1) * 1000)::float8 AS since,
       (extract(epoch FROM ($3::date + 1)::timestamp AT TIME ZONE $1) * 1000)::float8 AS until`,
    [timeZone, from, to],
  )
  const { since, until } = bounds[0]

  const [daysResult, sectionsResult, companions] = await Promise.all([
    query<{ day: string; seconds: number }>(
      `SELECT (started_at AT TIME ZONE $2)::date::text AS day, sum(extract(epoch FROM ended_at - started_at))::int AS seconds
       FROM study_segments
       WHERE user_id = $1 AND started_at >= to_timestamp($3 / 1000.0) AND started_at < to_timestamp($4 / 1000.0)
       GROUP BY day`,
      [accountId, timeZone, since, until],
    ),
    query<{ sectionId: string; seconds: number }>(
      `SELECT section_id::text AS "sectionId", sum(extract(epoch FROM ended_at - started_at))::int AS seconds
       FROM study_segments
       WHERE user_id = $1 AND section_id IS NOT NULL AND started_at >= to_timestamp($2 / 1000.0) AND started_at < to_timestamp($3 / 1000.0)
       GROUP BY section_id ORDER BY seconds DESC`,
      [accountId, since, until],
    ),
    findCompanions(accountId, since, null, until),
  ])

  // Las barras: cada tramo del período, también los vacíos
  const bucket = chooseBucket(from, to)
  const totals = new Map<string, number>()
  for (const row of daysResult.rows) {
    const start = bucketStart(row.day, bucket)
    totals.set(start, (totals.get(start) ?? 0) + row.seconds)
  }
  const bars: { date: string; seconds: number }[] = []
  for (let start = bucketStart(from, bucket); start <= to; start = nextBucket(start, bucket)) {
    bars.push({ date: start, seconds: totals.get(start) ?? 0 })
  }

  const seconds = daysResult.rows.reduce((sum, row) => sum + row.seconds, 0)
  const length = daysBetween(from, to) + 1
  return {
    from,
    to,
    seconds,
    activeDays: daysResult.rows.filter((row) => row.seconds > 0).length,
    dailyAverage: Math.round(seconds / length),
    bucket,
    bars,
    sections: sectionsResult.rows,
    companions,
  }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (request.method !== 'GET' || url.pathname !== '/api/stats') throw new RequestError(404, 'No encontrado.')
  if (!hasDatabase()) throw new RequestError(503, 'Las estadísticas no están disponibles ahora.')

  const account = await requireAccount(request)
  const requestedZone = url.searchParams.get('tz') ?? 'UTC'
  const timeZone = TIME_ZONES.has(requestedZone) ? requestedZone : 'UTC'
  const stats = await loadStats(account.id, timeZone)

  // Con un período (desde y hasta, o desde=inicio para todo), también sus números
  const fromParam = url.searchParams.get('desde')
  const toParam = url.searchParams.get('hasta')
  if (fromParam !== null || toParam !== null) {
    const to = parseDate(toParam) ?? stats.days[stats.days.length - 1].date
    const from = fromParam === 'inicio' ? null : parseDate(fromParam)
    if (fromParam !== 'inicio' && !from) throw new RequestError(400, 'Elige una fecha de inicio válida.')
    sendJson(response, 200, { ...stats, range: await loadRangeStats(account.id, timeZone, from, to) })
    return
  }
  sendJson(response, 200, stats)
}

export function createStatsHandler() {
  return createJsonHandler('las estadísticas', handleRequest, 'Las estadísticas no están disponibles ahora.')
}
