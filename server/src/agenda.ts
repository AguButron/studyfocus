import type { IncomingMessage, ServerResponse } from 'node:http'
import { requireAccount } from './accounts.ts'
import { query } from './database.ts'
import { findSection, parseId as parseSectionId } from './spaces.ts'
import { allowAttempt, createJsonHandler, readBody, RequestError, sendJson } from './requests.ts'

// La agenda de cada persona: pruebas, tareas, trabajos, presentaciones y recordatorios, con su fecha.
// Las fechas son días del calendario, sin zona horaria: el 14 de noviembre es el mismo en todas partes.

const KINDS = ['prueba', 'tarea', 'trabajo', 'presentacion', 'recordatorio']
const REMIND_DAYS = [0, 1, 2, 3, 7] // días antes en que empieza el aviso
const MAX_TITLE_LENGTH = 100
const MAX_NOTES_LENGTH = 500
const MAX_ITEMS = 2000 // por cuenta
const MAX_RANGE_DAYS = 371 // lo que se pide de una vez: alcanza para un año completo
const MAX_CHANGES = 300 // por cuenta cada 15 minutos
const OVERDUE_DAYS = 30 // las tareas atrasadas se siguen avisando hasta un mes
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
const DAY = 24 * 60 * 60 * 1000 // milisegundos
const NOT_FOUND = 'No se encontró. Puede que ya se haya borrado.'

const ITEM_COLUMNS = `id, kind, title, notes, to_char(due_date, 'YYYY-MM-DD') AS date,
  to_char(due_time, 'HH24:MI') AS time, remind_days AS "remindDays", done_at IS NOT NULL AS done,
  section_id::text AS "sectionId", weight::float8 AS weight, grade::float8 AS grade`

interface Item {
  id: string
  kind: string
  title: string
  notes: string | null
  date: string
  time: string | null
  remindDays: number | null
  done: boolean
  sectionId: string | null
  weight: number | null // el porcentaje de la nota del apartado
  grade: number | null
}

function parseDate(value: unknown) {
  if (typeof value !== 'string') return null
  const match = value.match(DATE)
  if (!match) return null

  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  // Descarta fechas que no existen, como el 31 de febrero
  if (date.getUTCMonth() !== month - 1 || year < 2000 || year > 2100) return null
  return value
}

function requireDate(value: unknown) {
  const date = parseDate(value)
  if (!date) throw new RequestError(400, 'Elige una fecha válida.')
  return date
}

function daysBetween(from: string, to: string) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY
}

// El apartado debe ser de la misma cuenta. La nota, dentro de su escala, y el porcentaje, de 0 a 100.
async function parseGrading(accountId: string, body: Record<string, unknown>) {
  if (body.sectionId === null || body.sectionId === undefined || body.sectionId === '') {
    if (body.grade !== null && body.grade !== undefined) throw new RequestError(400, 'Para anotar una nota, elige su apartado.')
    return { sectionId: null, weight: null, grade: null }
  }

  const section = await findSection(accountId, parseSectionId(body.sectionId))
  if (!section) throw new RequestError(400, 'Ese apartado ya no existe.')

  const weight = body.weight === null || body.weight === undefined ? null : body.weight
  if (weight !== null && (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 100)) {
    throw new RequestError(400, 'El porcentaje debe estar entre 0 y 100.')
  }
  const grade = body.grade === null || body.grade === undefined ? null : body.grade
  if (grade !== null && (typeof grade !== 'number' || !Number.isFinite(grade) || grade < section.gradeMin || grade > section.gradeMax)) {
    throw new RequestError(400, `La nota debe estar entre ${section.gradeMin} y ${section.gradeMax}.`)
  }
  return {
    sectionId: section.id,
    weight: weight === null ? null : Math.round(weight * 100) / 100,
    grade: grade === null ? null : Math.round(grade * 100) / 100,
  }
}

function parseItem(body: Record<string, unknown>) {
  const kind = typeof body.kind === 'string' && KINDS.includes(body.kind) ? body.kind : null
  if (!kind) throw new RequestError(400, 'Elige qué es: prueba, tarea, trabajo, presentación o recordatorio.')

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title || title.length > MAX_TITLE_LENGTH) throw new RequestError(400, `Escribe un título de hasta ${MAX_TITLE_LENGTH} caracteres.`)

  const notesText = typeof body.notes === 'string' ? body.notes.trim() : ''
  if (notesText.length > MAX_NOTES_LENGTH) throw new RequestError(400, `Las notas pueden tener hasta ${MAX_NOTES_LENGTH} caracteres.`)

  const time = body.time === null || body.time === undefined || body.time === '' ? null : body.time
  if (time !== null && (typeof time !== 'string' || !TIME.test(time))) throw new RequestError(400, 'Elige una hora válida.')

  const remindDays = body.remindDays === null || body.remindDays === undefined ? null : body.remindDays
  if (remindDays !== null && !REMIND_DAYS.includes(remindDays as number)) throw new RequestError(400, 'Elige cuándo avisarte.')

  return { kind, title, notes: notesText || null, date: requireDate(body.date), time, remindDays: remindDays as number | null }
}

function parseId(value: unknown) {
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) throw new RequestError(404, NOT_FOUND)
  return value
}

function readParams(request: IncomingMessage) {
  return new URL(request.url ?? '/', 'http://localhost').searchParams
}

async function listRange(accountId: string, from: string, to: string) {
  const { rows } = await query<Item>(
    `SELECT ${ITEM_COLUMNS} FROM agenda_items
     WHERE user_id = $1 AND due_date BETWEEN $2 AND $3
     ORDER BY due_date, due_time NULLS LAST, id`,
    [accountId, from, to],
  )
  return rows
}

// Lo que hay que avisar hoy: lo que entró en su aviso y aún no pasa, y las tareas atrasadas sin hacer.
// Las pruebas que ya pasaron no se avisan: no hay nada que hacer con ellas.
async function listReminders(accountId: string, today: string) {
  const { rows } = await query<Item>(
    `SELECT ${ITEM_COLUMNS} FROM agenda_items
     WHERE user_id = $1 AND done_at IS NULL AND (
       (due_date >= $2::date AND remind_days IS NOT NULL AND due_date - remind_days <= $2::date)
       OR (due_date < $2::date AND due_date >= $2::date - $3::int AND kind <> 'prueba')
     )
     ORDER BY due_date, due_time NULLS LAST, id`,
    [accountId, today, OVERDUE_DAYS],
  )
  return rows
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const account = await requireAccount(request)
  const route = `${request.method} ${request.url?.split('?')[0]}`

  // Todo lo de un apartado, sin importar la fecha: sus pruebas con notas y sus tareas
  if (route === 'GET /api/agenda' && readParams(request).has('apartado')) {
    const sectionId = parseSectionId(readParams(request).get('apartado'))
    const { rows } = await query<Item>(
      `SELECT ${ITEM_COLUMNS} FROM agenda_items WHERE user_id = $1 AND section_id = $2
       ORDER BY due_date, due_time NULLS LAST, id`,
      [account.id, sectionId],
    )
    sendJson(response, 200, { items: rows })
    return
  }

  if (route === 'GET /api/agenda') {
    const params = readParams(request)
    const from = requireDate(params.get('desde'))
    const to = requireDate(params.get('hasta'))
    const days = daysBetween(from, to)
    if (days < 0 || days > MAX_RANGE_DAYS) throw new RequestError(400, 'Rango de fechas no válido.')
    sendJson(response, 200, { items: await listRange(account.id, from, to) })
    return
  }

  if (route === 'GET /api/agenda/avisos') {
    const today = requireDate(readParams(request).get('hoy'))
    sendJson(response, 200, { items: await listReminders(account.id, today) })
    return
  }

  if (request.method !== 'POST') throw new RequestError(404, 'No encontrado.')
  if (!allowAttempt(`agenda:${account.id}`, MAX_CHANGES)) {
    throw new RequestError(429, 'Demasiados cambios seguidos. Prueba de nuevo en unos minutos.')
  }
  const body = await readBody(request)

  if (route === 'POST /api/agenda') {
    const item = parseItem(body)
    const grading = await parseGrading(account.id, body)
    const { rows } = await query<Item>(
      `INSERT INTO agenda_items (user_id, kind, title, notes, due_date, due_time, remind_days, section_id, weight, grade)
       SELECT $1, $2, $3, $4, $5, $6, $7, $9, $10, $11
       WHERE (SELECT count(*) FROM agenda_items WHERE user_id = $1) < $8
       RETURNING ${ITEM_COLUMNS}`,
      [account.id, item.kind, item.title, item.notes, item.date, item.time, item.remindDays, MAX_ITEMS,
        grading.sectionId, grading.weight, grading.grade],
    )
    if (!rows[0]) throw new RequestError(409, `Llegaste al máximo de ${MAX_ITEMS} cosas en tu agenda. Borra algunas antiguas.`)
    sendJson(response, 200, rows[0])
    return
  }

  const id = parseId(body.id)
  let rows: Item[]

  if (route === 'POST /api/agenda/editar') {
    const item = parseItem(body)
    const grading = await parseGrading(account.id, body)
    ;({ rows } = await query<Item>(
      `UPDATE agenda_items SET kind = $3, title = $4, notes = $5, due_date = $6, due_time = $7, remind_days = $8,
         section_id = $9, weight = $10, grade = $11
       WHERE id = $1 AND user_id = $2 RETURNING ${ITEM_COLUMNS}`,
      [id, account.id, item.kind, item.title, item.notes, item.date, item.time, item.remindDays,
        grading.sectionId, grading.weight, grading.grade],
    ))
  } else if (route === 'POST /api/agenda/hecha') {
    if (typeof body.done !== 'boolean') throw new RequestError(400, 'Formato no válido.')
    ;({ rows } = await query<Item>(
      `UPDATE agenda_items SET done_at = CASE WHEN $3 THEN coalesce(done_at, now()) END
       WHERE id = $1 AND user_id = $2 RETURNING ${ITEM_COLUMNS}`,
      [id, account.id, body.done],
    ))
  } else if (route === 'POST /api/agenda/borrar') {
    ;({ rows } = await query<Item>(`DELETE FROM agenda_items WHERE id = $1 AND user_id = $2 RETURNING ${ITEM_COLUMNS}`, [
      id,
      account.id,
    ]))
  } else {
    throw new RequestError(404, 'No encontrado.')
  }

  if (!rows[0]) throw new RequestError(404, NOT_FOUND)
  sendJson(response, 200, rows[0])
}

export function createAgendaHandler() {
  return createJsonHandler('la agenda', handleRequest)
}
