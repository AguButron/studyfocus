import type { IncomingMessage, ServerResponse } from 'node:http'
import { requireAccount } from './accounts.ts'
import { query } from './database.ts'
import { allowAttempt, createJsonHandler, readBody, RequestError, sendJson } from './requests.ts'

// Los espacios agrupan lo que se estudia o se hace: un semestre (2026-1, Spring 2026), un proyecto
// personal, un curso. Cada espacio tiene apartados: los ramos de un semestre, las partes de un proyecto.
// A un apartado se vinculan las cosas de la agenda, con sus notas, y el tiempo de estudio.

export const SPACE_KINDS = ['semestre', 'proyecto', 'curso', 'otro']
export const SECTION_COLORS = [
  '#e5484d', // rojo
  '#f76b15', // naranjo
  '#f5a524', // amarillo
  '#30a46c', // verde
  '#12a594', // turquesa
  '#0090ff', // azul
  '#3e63dd', // índigo
  '#8e4ec6', // morado
  '#d6409f', // rosado
  '#8d8d86', // gris
]

const MAX_NAME_LENGTH = 60
const MAX_TEXT_LENGTH = 80
const MAX_CODE_LENGTH = 20
const MAX_SPACES = 100
export const MAX_SECTIONS_PER_SPACE = 30
const MAX_CHANGES = 300 // por cuenta cada 15 minutos
const MAX_WEEKLY_GOAL = 100 * 60 // minutos
const MAX_SCHEDULE_LENGTH = 200
export const MAX_REQUIREMENTS_LENGTH = 1000
export const MAX_RULES = 12
const MAX_RULE_LABEL_LENGTH = 120
export const RULE_KINDS = ['average', 'each', 'exempt']
const MAX_GRADE = 1000 // escalas como 0 a 100, 1 a 7 o 0 a 20 caben de sobra
const WEEK_DAYS = 7
const MAX_CLASSES = 20 // bloques de clase por semana
const MAX_CLASS_TEXT = 40
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const NOT_FOUND = 'No se encontró. Puede que ya se haya borrado.'

// La escala chilena es la que se propone; cada apartado puede cambiarla
const DEFAULT_SCALE = { gradeMin: 1, gradeMax: 7, gradePass: 4, exigencia: 50 }

const SPACE_COLUMNS = `id, kind, name, archived_at IS NOT NULL AS archived`
const SECTION_COLUMNS = `sections.id, sections.space_id AS "spaceId", sections.name, sections.color, sections.code,
  sections.teacher, sections.place, sections.weekly_goal_minutes AS "weeklyGoalMinutes",
  sections.grade_min::float8 AS "gradeMin", sections.grade_max::float8 AS "gradeMax",
  sections.grade_pass::float8 AS "gradePass", sections.exigencia, sections.schedule, sections.requirements,
  sections.rules, sections.classes`

interface SectionRow {
  id: string
  spaceId: string
  name: string
  color: string
  code: string | null
  teacher: string | null
  place: string | null
  weeklyGoalMinutes: number | null
  gradeMin: number
  gradeMax: number
  gradePass: number
  exigencia: number
  schedule: string | null
  requirements: string | null
  rules: Rule[]
  classes: ClassBlock[]
}

// Una clase de la semana: día (1 es lunes, 7 domingo), hora de inicio y de término,
// y si se sabe, qué es (cátedra, ayudantía, laboratorio) y dónde
export interface ClassBlock {
  day: number
  start: string
  end: string
  kind: string | null
  place: string | null
}

// Un requisito para aprobar. Sin evaluaciones, se refiere al promedio final del apartado.
// average: el promedio ponderado de esas evaluaciones debe llegar a min.
// each: cada una de esas evaluaciones debe llegar a min (por ejemplo, el examen).
// exempt: con un promedio de esas evaluaciones de al menos min, se exime de las de exemptIds (por ejemplo, del examen).
export interface Rule {
  id: string
  kind: 'average' | 'each' | 'exempt'
  label: string
  min: number
  itemIds: string[] | null
  exemptIds?: string[] | null // solo en exempt; los requisitos guardados antes no lo tienen
}

function parseText(value: unknown, maxLength: number, label: string) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new RequestError(400, 'Formato no válido.')
  const text = value.trim()
  if (text.length > maxLength) throw new RequestError(400, `${label}: usa hasta ${maxLength} caracteres.`)
  return text || null
}

function parseName(value: unknown) {
  const name = parseText(value, MAX_NAME_LENGTH, 'El nombre')
  if (!name) throw new RequestError(400, `Escribe un nombre de hasta ${MAX_NAME_LENGTH} caracteres.`)
  return name
}

function parseNumber(value: unknown, min: number, max: number, message: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RequestError(400, message)
  }
  return Math.round(value * 100) / 100
}

// Las reglas llegan con las evaluaciones a las que se refieren: sus ids, o lo que diga toItemIds
export function parseRules(
  value: unknown,
  scale: { gradeMin: number; gradeMax: number },
  toItemIds: (value: unknown) => string[] | null,
): Rule[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_RULES) throw new RequestError(400, `Usa hasta ${MAX_RULES} requisitos.`)
  return value.map((raw: Record<string, unknown>, index) => {
    const kind = typeof raw?.kind === 'string' && RULE_KINDS.includes(raw.kind) ? (raw.kind as Rule['kind']) : null
    if (!kind) throw new RequestError(400, 'Revisa el tipo de cada requisito.')
    const label = parseText(raw.label, MAX_RULE_LABEL_LENGTH, 'Cada requisito')
    if (!label) throw new RequestError(400, 'Escribe qué dice cada requisito.')
    const min = parseNumber(raw.min, scale.gradeMin, scale.gradeMax, `La nota de "${label}" debe estar dentro de la escala.`)
    const itemIds = toItemIds(raw.itemIds ?? raw.evaluations)
    const exemptIds = kind === 'exempt' ? (toItemIds(raw.exemptIds ?? raw.exempts) ?? []).filter((id) => !itemIds?.includes(id)) : []
    return {
      id: String(index + 1),
      kind,
      label,
      min,
      itemIds: itemIds && itemIds.length > 0 ? itemIds : null,
      exemptIds: exemptIds.length > 0 ? exemptIds : null,
    }
  })
}

// Las clases de la semana, ordenadas por día y hora
export function parseClasses(value: unknown): ClassBlock[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_CLASSES) throw new RequestError(400, `Usa hasta ${MAX_CLASSES} clases por semana.`)
  return value
    .map((raw: Record<string, unknown>) => {
      const day = raw?.day
      if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > 7) throw new RequestError(400, 'Elige el día de cada clase.')
      if (typeof raw.start !== 'string' || !TIME.test(raw.start) || typeof raw.end !== 'string' || !TIME.test(raw.end)) {
        throw new RequestError(400, 'Escribe la hora de inicio y de término de cada clase.')
      }
      if (raw.start >= raw.end) throw new RequestError(400, 'Cada clase debe terminar después de empezar.')
      return {
        day: day as number,
        start: raw.start,
        end: raw.end,
        kind: parseText(raw.kind, MAX_CLASS_TEXT, 'El tipo de clase'),
        place: parseText(raw.place, MAX_CLASS_TEXT, 'La sala de la clase'),
      }
    })
    .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
}

export function parseId(value: unknown) {
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) throw new RequestError(404, NOT_FOUND)
  return value
}

function parseSpace(body: Record<string, unknown>) {
  const kind = typeof body.kind === 'string' && SPACE_KINDS.includes(body.kind) ? body.kind : null
  if (!kind) throw new RequestError(400, 'Elige qué es: semestre, proyecto, curso u otro.')
  return { kind, name: parseName(body.name) }
}

export function parseSection(body: Record<string, unknown>) {
  const color = typeof body.color === 'string' && SECTION_COLORS.includes(body.color) ? body.color : null
  if (!color) throw new RequestError(400, 'Elige uno de los colores.')

  const goal = body.weeklyGoalMinutes
  const weeklyGoalMinutes =
    goal === null || goal === undefined || goal === 0
      ? null
      : Math.round(parseNumber(goal, 1, MAX_WEEKLY_GOAL, 'La meta semanal debe ser de hasta 100 horas.'))

  const scale = { ...DEFAULT_SCALE, ...(body.scale as Record<string, unknown> | undefined) }
  const gradeMin = parseNumber(scale.gradeMin, 0, MAX_GRADE, 'Revisa la nota mínima.')
  const gradeMax = parseNumber(scale.gradeMax, 0, MAX_GRADE, 'Revisa la nota máxima.')
  const gradePass = parseNumber(scale.gradePass, 0, MAX_GRADE, 'Revisa la nota para aprobar.')
  const exigencia = Math.round(parseNumber(scale.exigencia, 1, 99, 'La exigencia debe estar entre 1 y 99 %.'))
  if (!(gradeMin < gradePass && gradePass <= gradeMax)) {
    throw new RequestError(400, 'La nota para aprobar debe estar entre la mínima y la máxima.')
  }

  return {
    name: parseName(body.name),
    color,
    code: parseText(body.code, MAX_CODE_LENGTH, 'La sigla'),
    teacher: parseText(body.teacher, MAX_TEXT_LENGTH, 'El profesor'),
    place: parseText(body.place, MAX_TEXT_LENGTH, 'La sala'),
    schedule: parseText(body.schedule, MAX_SCHEDULE_LENGTH, 'El horario'),
    requirements: parseText(body.requirements, MAX_REQUIREMENTS_LENGTH, 'Los requisitos'),
    weeklyGoalMinutes,
    gradeMin,
    gradeMax,
    gradePass,
    exigencia,
  }
}

// Los espacios con sus apartados y cuánto se ha estudiado en cada uno, esta semana y en total
async function listSpaces(accountId: string) {
  const [spaces, sections, seconds] = await Promise.all([
    query<{ id: string; kind: string; name: string; archived: boolean }>(
      `SELECT ${SPACE_COLUMNS} FROM spaces WHERE user_id = $1 ORDER BY archived_at IS NOT NULL, created_at DESC`,
      [accountId],
    ),
    query<SectionRow>(`SELECT ${SECTION_COLUMNS} FROM sections WHERE user_id = $1 ORDER BY created_at`, [accountId]),
    query<{ sectionId: string; week: number; total: number }>(
      `SELECT section_id AS "sectionId",
         coalesce(sum(extract(epoch FROM ended_at - started_at)) FILTER (WHERE ended_at > now() - make_interval(days => $2)), 0)::int AS week,
         sum(extract(epoch FROM ended_at - started_at))::int AS total
       FROM study_segments WHERE user_id = $1 AND section_id IS NOT NULL GROUP BY section_id`,
      [accountId, WEEK_DAYS],
    ),
  ])

  const studied = new Map(seconds.rows.map((row) => [row.sectionId, row]))
  return spaces.rows.map((space) => ({
    ...space,
    sections: sections.rows
      .filter((section) => section.spaceId === space.id)
      .map((section) => ({
        ...section,
        weekSeconds: studied.get(section.id)?.week ?? 0,
        totalSeconds: studied.get(section.id)?.total ?? 0,
      })),
  }))
}

// El apartado si es de esta cuenta, con su escala de notas
export async function findSection(accountId: string, sectionId: string) {
  const { rows } = await query<SectionRow>(`SELECT ${SECTION_COLUMNS} FROM sections WHERE id = $1 AND user_id = $2`, [
    sectionId,
    accountId,
  ])
  return rows[0] ?? null
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const account = await requireAccount(request)
  const route = `${request.method} ${request.url?.split('?')[0]}`

  if (route === 'GET /api/espacios') {
    sendJson(response, 200, { spaces: await listSpaces(account.id), colors: SECTION_COLORS })
    return
  }

  if (request.method !== 'POST') throw new RequestError(404, 'No encontrado.')
  if (!allowAttempt(`spaces:${account.id}`, MAX_CHANGES)) {
    throw new RequestError(429, 'Demasiados cambios seguidos. Prueba de nuevo en unos minutos.')
  }
  const body = await readBody(request)
  let rowCount: number | null = 0

  if (route === 'POST /api/espacios') {
    const space = parseSpace(body)
    ;({ rowCount } = await query(
      `INSERT INTO spaces (user_id, kind, name) SELECT $1, $2, $3
       WHERE (SELECT count(*) FROM spaces WHERE user_id = $1) < $4`,
      [account.id, space.kind, space.name, MAX_SPACES],
    ))
    if (!rowCount) throw new RequestError(409, `Llegaste al máximo de ${MAX_SPACES} carpetas.`)
  } else if (route === 'POST /api/espacios/editar') {
    const space = parseSpace(body)
    ;({ rowCount } = await query('UPDATE spaces SET kind = $3, name = $4 WHERE id = $1 AND user_id = $2', [
      parseId(body.id),
      account.id,
      space.kind,
      space.name,
    ]))
  } else if (route === 'POST /api/espacios/archivar') {
    if (typeof body.archived !== 'boolean') throw new RequestError(400, 'Formato no válido.')
    ;({ rowCount } = await query(
      `UPDATE spaces SET archived_at = CASE WHEN $3 THEN coalesce(archived_at, now()) END WHERE id = $1 AND user_id = $2`,
      [parseId(body.id), account.id, body.archived],
    ))
  } else if (route === 'POST /api/espacios/borrar') {
    // Sus apartados se borran con él; la agenda y el tiempo de estudio quedan, sin apartado
    ;({ rowCount } = await query('DELETE FROM spaces WHERE id = $1 AND user_id = $2', [parseId(body.id), account.id]))
  } else if (route === 'POST /api/apartados') {
    const section = parseSection(body)
    ;({ rowCount } = await query(
      `INSERT INTO sections (user_id, space_id, name, color, code, teacher, place, weekly_goal_minutes,
         grade_min, grade_max, grade_pass, exigencia, schedule, requirements)
       SELECT $1, spaces.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $14, $15 FROM spaces
       WHERE spaces.id = $2 AND spaces.user_id = $1
         AND (SELECT count(*) FROM sections WHERE space_id = $2) < $13`,
      [
        account.id,
        parseId(body.spaceId),
        section.name,
        section.color,
        section.code,
        section.teacher,
        section.place,
        section.weeklyGoalMinutes,
        section.gradeMin,
        section.gradeMax,
        section.gradePass,
        section.exigencia,
        MAX_SECTIONS_PER_SPACE,
        section.schedule,
        section.requirements,
      ],
    ))
    if (!rowCount) throw new RequestError(409, `No se pudo crear. Cada carpeta tiene hasta ${MAX_SECTIONS_PER_SPACE} apartados.`)
  } else if (route === 'POST /api/apartados/editar') {
    const section = parseSection(body)
    ;({ rowCount } = await query(
      `UPDATE sections SET name = $3, color = $4, code = $5, teacher = $6, place = $7, weekly_goal_minutes = $8,
         grade_min = $9, grade_max = $10, grade_pass = $11, exigencia = $12, schedule = $13, requirements = $14
       WHERE id = $1 AND user_id = $2`,
      [
        parseId(body.id),
        account.id,
        section.name,
        section.color,
        section.code,
        section.teacher,
        section.place,
        section.weeklyGoalMinutes,
        section.gradeMin,
        section.gradeMax,
        section.gradePass,
        section.exigencia,
        section.schedule,
        section.requirements,
      ],
    ))
  } else if (route === 'POST /api/apartados/clases') {
    // Las clases de la semana se ponen a mano desde el horario, aparte del resto del apartado
    ;({ rowCount } = await query('UPDATE sections SET classes = $3 WHERE id = $1 AND user_id = $2', [
      parseId(body.id),
      account.id,
      JSON.stringify(parseClasses(body.classes)),
    ]))
  } else if (route === 'POST /api/apartados/reglas') {
    // Los requisitos de un apartado; sus evaluaciones deben ser de ese mismo apartado
    const section = await findSection(account.id, parseId(body.id))
    if (!section) throw new RequestError(404, NOT_FOUND)
    const { rows: items } = await query<{ id: string }>('SELECT id::text FROM agenda_items WHERE section_id = $1 AND user_id = $2', [
      section.id,
      account.id,
    ])
    const owned = new Set(items.map((item) => item.id))
    const rules = parseRules(body.rules, section, (value) => {
      if (value === null || value === undefined) return null
      if (!Array.isArray(value)) throw new RequestError(400, 'Formato no válido.')
      return value.filter((id): id is string => typeof id === 'string' && owned.has(id))
    })
    ;({ rowCount } = await query('UPDATE sections SET rules = $3 WHERE id = $1 AND user_id = $2', [
      section.id,
      account.id,
      JSON.stringify(rules),
    ]))
  } else if (route === 'POST /api/apartados/borrar') {
    ;({ rowCount } = await query('DELETE FROM sections WHERE id = $1 AND user_id = $2', [parseId(body.id), account.id]))
  } else {
    throw new RequestError(404, 'No encontrado.')
  }

  if (!rowCount) throw new RequestError(404, NOT_FOUND)
  sendJson(response, 200, { spaces: await listSpaces(account.id), colors: SECTION_COLORS })
}

export { listSpaces }

export function createSpacesHandler() {
  return createJsonHandler('las carpetas', handleRequest)
}
