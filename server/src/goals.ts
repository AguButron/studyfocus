import type { IncomingMessage, ServerResponse } from 'node:http'
import { requireAccount } from './accounts.ts'
import { hasDatabase, query } from './database.ts'
import { allowAttempt, createJsonHandler, readBody, RequestError, sendJson } from './requests.ts'
import { findSection, parseId } from './spaces.ts'
import { TIME_ZONES } from './stats.ts'

// Los objetivos de estudio: "quiero estudiar 8 horas antes del viernes", de un ramo o en general.
// Cuenta lo estudiado desde que se crea hasta que termina el día límite, en la zona horaria de la persona.
// Si es de un ramo, solo cuenta lo que se estudió con ese ramo elegido en el temporizador.

const MAX_ACTIVE = 20
const MAX_MINUTES = 1000 * 60 // mil horas
const MAX_DAYS_AHEAD = 2 * 366
const SHOW_ENDED_HOURS = 12 // los terminados se siguen viendo en Inicio unas horas, para saber cómo resultó; después van al historial
const HISTORY_LIMIT = 500 // los anteriores que se muestran, los más recientes primero (de sobra: es para no traer miles)
const MAX_CHANGES = 120 // por cuenta cada 15 minutos
const DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY = 24 * 60 * 60 * 1000

interface Goal {
  id: string
  sectionId: string | null
  minutes: number
  deadline: string // el último día, "2026-11-14"
  startsAt: string
  seconds: number // lo estudiado para el objetivo
  isEnded: boolean // ya pasó el día límite
  isArchived: boolean // se sacó de la lista con la X
}

// Los que se ven en la lista: sin archivar, y si ya terminaron, solo los que terminaron hace pocas horas
const ACTIVE = `goals.archived_at IS NULL AND now() < limits.until + make_interval(hours => $3)`

// Cada objetivo con lo estudiado para él: los tramos que caen entre su creación y el fin del día límite.
// La lista (activos) o los anteriores (archivados, o terminados hace más de unas horas), los más recientes primero
async function listGoals(accountId: string, timeZone: string, history = false) {
  const { rows } = await query<Goal>(
    `SELECT goals.id::text, goals.section_id::text AS "sectionId", goals.minutes, goals.deadline::text AS deadline,
       goals.starts_at AS "startsAt", (now() AT TIME ZONE $2)::date > goals.deadline AS "isEnded",
       goals.archived_at IS NOT NULL AS "isArchived",
       coalesce((
         SELECT sum(extract(epoch FROM least(segments.ended_at, limits.until) - greatest(segments.started_at, goals.starts_at)))
         FROM study_segments segments
         WHERE segments.user_id = goals.user_id
           AND segments.ended_at > goals.starts_at AND segments.started_at < limits.until
           AND (goals.section_id IS NULL OR segments.section_id = goals.section_id)
       ), 0)::int AS seconds
     FROM study_goals goals
     CROSS JOIN LATERAL (SELECT ((goals.deadline + 1)::timestamp AT TIME ZONE $2) AS until) limits
     WHERE goals.user_id = $1 AND ${history ? `NOT (${ACTIVE})` : ACTIVE}
     ORDER BY ${history ? 'goals.deadline DESC, goals.id DESC LIMIT $4' : '"isEnded", goals.deadline, goals.id'}`,
    history ? [accountId, timeZone, SHOW_ENDED_HOURS, HISTORY_LIMIT] : [accountId, timeZone, SHOW_ENDED_HOURS],
  )
  return rows
}

// La página de objetivos anteriores: la lista, cuántos te has propuesto y cuántos cumpliste (contando los activos)
async function listHistory(accountId: string, timeZone: string) {
  const [goals, history] = await Promise.all([listGoals(accountId, timeZone), listGoals(accountId, timeZone, true)])
  const all = [...goals, ...history]
  return { history, total: all.length, done: all.filter((goal) => goal.seconds >= goal.minutes * 60).length }
}

function readTimeZone(value: unknown) {
  return typeof value === 'string' && TIME_ZONES.has(value) ? value : 'UTC'
}

function parseMinutes(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > MAX_MINUTES) {
    throw new RequestError(400, 'Elige cuántas horas quieres estudiar, hasta mil.')
  }
  return Math.round(value)
}

// El día límite: hoy o más adelante, hasta dos años
function parseDeadline(value: unknown, today: string) {
  if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new RequestError(400, 'Elige hasta qué fecha.')
  }
  if (value < today) throw new RequestError(400, 'La fecha límite no puede ser antes de hoy.')
  if (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`) > MAX_DAYS_AHEAD * DAY) {
    throw new RequestError(400, 'Elige una fecha dentro de los próximos dos años.')
  }
  return value
}

async function readToday(timeZone: string) {
  const { rows } = await query<{ today: string }>('SELECT (now() AT TIME ZONE $1)::date::text AS today', [timeZone])
  return rows[0].today
}

async function parseSection(accountId: string, value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const section = await findSection(accountId, parseId(value))
  if (!section) throw new RequestError(400, 'Ese ramo ya no existe.')
  return section.id
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  if (!hasDatabase()) throw new RequestError(503, 'Los objetivos no están disponibles ahora.')
  const account = await requireAccount(request)
  const url = new URL(request.url ?? '/', 'http://localhost')
  const route = `${request.method} ${url.pathname}`

  if (route === 'GET /api/objetivos') {
    const timeZone = readTimeZone(url.searchParams.get('tz'))
    sendJson(response, 200, { goals: await listGoals(account.id, timeZone) })
    return
  }
  if (route === 'GET /api/objetivos/historial') {
    const timeZone = readTimeZone(url.searchParams.get('tz'))
    sendJson(response, 200, await listHistory(account.id, timeZone))
    return
  }

  if (request.method !== 'POST') throw new RequestError(404, 'No encontrado.')
  if (!allowAttempt(`goals:${account.id}`, MAX_CHANGES)) {
    throw new RequestError(429, 'Demasiados cambios seguidos. Prueba de nuevo en unos minutos.')
  }
  const body = await readBody(request)
  const timeZone = readTimeZone(body.tz)
  const today = await readToday(timeZone)

  if (route === 'POST /api/objetivos') {
    const minutes = parseMinutes(body.minutes)
    const deadline = parseDeadline(body.deadline, today)
    const sectionId = await parseSection(account.id, body.sectionId)
    const { rowCount } = await query(
      `INSERT INTO study_goals (user_id, section_id, minutes, deadline)
       SELECT $1, $2, $3, $4
       WHERE (SELECT count(*) FROM study_goals WHERE user_id = $1 AND deadline >= $5::date AND archived_at IS NULL) < $6`,
      [account.id, sectionId, minutes, deadline, today, MAX_ACTIVE],
    )
    if (!rowCount) throw new RequestError(409, `Puedes tener hasta ${MAX_ACTIVE} objetivos a la vez.`)
  } else if (route === 'POST /api/objetivos/archivar') {
    // archived: true lo pasa al historial; false lo devuelve a la lista (el "Deshacer")
    if (typeof body.archived !== 'boolean') throw new RequestError(400, 'Falta si se archiva o no.')
    const { rowCount } = await query(
      'UPDATE study_goals SET archived_at = CASE WHEN $3 THEN now() END WHERE id = $1 AND user_id = $2',
      [parseId(body.id), account.id, body.archived],
    )
    if (!rowCount) throw new RequestError(404, 'Ese objetivo ya no existe.')
  } else if (route === 'POST /api/objetivos/borrar') {
    await query('DELETE FROM study_goals WHERE id = $1 AND user_id = $2', [parseId(body.id), account.id])
  } else {
    throw new RequestError(404, 'No encontrado.')
  }

  sendJson(response, 200, { goals: await listGoals(account.id, timeZone) })
}

export function createGoalsHandler() {
  return createJsonHandler('los objetivos', handleRequest, 'Los objetivos no están disponibles ahora.')
}
