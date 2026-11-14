// Los espacios (un semestre, un proyecto, un curso) y sus apartados (ramos, partes, módulos).
// Se cargan una vez y se comparten: el calendario, la agenda y el temporizador los usan.

export type SpaceKind = 'semestre' | 'proyecto' | 'curso' | 'otro'

export interface Section {
  id: string
  spaceId: string
  name: string
  color: string
  code: string | null // la sigla, como MAT1620
  teacher: string | null
  place: string | null
  weeklyGoalMinutes: number | null
  gradeMin: number
  gradeMax: number
  gradePass: number
  exigencia: number // el porcentaje del puntaje que da la nota para aprobar
  schedule: string | null // el horario de clases, como "Lun y Mié 10:00–11:20"
  requirements: string | null // lo que se necesita para aprobar, en palabras
  rules: Rule[]
  classes: ClassBlock[] // las clases de cada semana, que se ponen a mano en el horario
  weekSeconds: number // estudiado en los últimos 7 días
  totalSeconds: number
}

// Una clase de la semana: day 1 es lunes y 7 domingo; start y end como "10:00".
// kind dice qué es (cátedra, ayudantía, laboratorio) y place, dónde, si se sabe.
export interface ClassBlock {
  day: number
  start: string
  end: string
  kind: string | null
  place: string | null
}

export interface Space {
  id: string
  kind: SpaceKind
  name: string
  archived: boolean
  sections: Section[]
}

// Un requisito para aprobar. Sin evaluaciones (itemIds nulo), se refiere al promedio final.
// average: el promedio de esas evaluaciones llega a min. each: cada una llega a min.
// exempt: con ese promedio se exime de las evaluaciones de exemptIds (por ejemplo, del examen).
export type RuleKind = 'average' | 'each' | 'exempt'
export interface Rule {
  id: string
  kind: RuleKind
  label: string
  min: number
  itemIds: string[] | null
  exemptIds?: string[] | null // los requisitos guardados antes no lo tienen
}

export type SectionDraft = Pick<Section, 'name' | 'color' | 'code' | 'teacher' | 'place' | 'schedule' | 'requirements' | 'weeklyGoalMinutes'> & {
  scale: Pick<Section, 'gradeMin' | 'gradeMax' | 'gradePass' | 'exigencia'>
}

// Cómo se llaman las cosas según el tipo de espacio
export const SPACE_KINDS: { id: SpaceKind; name: string; sections: string; section: string; example: string }[] = [
  { id: 'semestre', name: 'Semestre', sections: 'Ramos', section: 'Ramo', example: '2026-1, Spring 2026' },
  { id: 'proyecto', name: 'Proyecto', sections: 'Partes', section: 'Parte', example: 'Mi app, Tesis' },
  { id: 'curso', name: 'Curso', sections: 'Módulos', section: 'Módulo', example: 'Inglés B2, Curso de Python' },
  { id: 'otro', name: 'Otro', sections: 'Secciones', section: 'Sección', example: 'Preuniversitario' },
]

export const DEFAULT_SCALE = { gradeMin: 1, gradeMax: 7, gradePass: 4, exigencia: 50 }

export function describeKind(kind: SpaceKind) {
  return SPACE_KINDS.find(({ id }) => id === kind) ?? SPACE_KINDS[3]
}

type Result<T> = { value: T; error: null } | { value: null; error: string }
interface SpacesResponse {
  spaces: Space[]
  colors: string[]
}

let spaces: Space[] = []
let colors: string[] = []
let loading: Promise<Space[]> | null = null
const listeners: (() => void)[] = []

export function onSpacesChange(listener: () => void) {
  listeners.push(listener)
}

function store(result: SpacesResponse) {
  spaces = result.spaces
  colors = result.colors
  for (const listener of listeners) listener()
}

async function call(path: string, body?: unknown): Promise<Result<SpacesResponse>> {
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) return { value: null, error: result.error ?? 'No se pudo completar.' }
    return { value: result, error: null }
  } catch {
    return { value: null, error: 'No se pudo conectar con el servidor.' }
  }
}

let isLoaded = false

// Los pide la primera vez; después usa los que ya tiene
export async function ensureSpaces() {
  if (!isLoaded) await loadSpaces()
}

// Cómo se muestra el apartado de algo de la agenda: su sigla, o su nombre (label), y su nombre completo (name)
export function describeItemSection(sectionId: string | null) {
  const found = findSection(sectionId)
  return found
    ? { label: found.section.code ?? found.section.name, name: found.section.name, color: found.section.color }
    : null
}

// Vuelve a pedirlos al servidor, por ejemplo para ver las horas estudiadas al día
export async function loadSpaces(): Promise<Space[]> {
  loading ??= call('/api/espacios').then((result) => {
    loading = null
    if (result.value) {
      isLoaded = true
      store(result.value)
    }
    return spaces
  })
  return loading
}

export function getSpaces() {
  return spaces
}

export function getColors() {
  return colors
}

export function findSection(id: string | null) {
  if (!id) return null
  for (const space of spaces) {
    const section = space.sections.find((item) => item.id === id)
    if (section) return { section, space }
  }
  return null
}

async function change(path: string, body: unknown) {
  const result = await call(path, body)
  if (result.value) store(result.value)
  return result.error
}

export const createSpace = (kind: SpaceKind, name: string) => change('/api/espacios', { kind, name })
export const updateSpace = (id: string, kind: SpaceKind, name: string) => change('/api/espacios/editar', { id, kind, name })
export const archiveSpace = (id: string, archived: boolean) => change('/api/espacios/archivar', { id, archived })
export const deleteSpace = (id: string) => change('/api/espacios/borrar', { id })
export const createSection = (spaceId: string, draft: SectionDraft) => change('/api/apartados', { spaceId, ...draft })
export const updateSection = (id: string, draft: SectionDraft) => change('/api/apartados/editar', { id, ...draft })
export const deleteSection = (id: string) => change('/api/apartados/borrar', { id })
export const updateRules = (id: string, rules: Rule[]) => change('/api/apartados/reglas', { id, rules })
// Las clases de la semana se guardan aparte, desde el horario
export const updateClasses = (id: string, classes: ClassBlock[]) => change('/api/apartados/clases', { id, classes })

// Lo que trae la creación desde los programas: las carpetas al día y cuánto se creó
export async function storeSpaces(result: SpacesResponse) {
  store(result)
}

// ── Notas ──────────────────────────────────────────────────────────────

// La nota según el puntaje, con la exigencia del apartado. Con 60 % de exigencia, el 60 % del puntaje da
// la nota para aprobar; bajo eso la nota sube parejo desde la mínima, y sobre eso, hasta la máxima.
export function gradeFromPoints(section: Section, points: number, total: number) {
  const needed = (section.exigencia / 100) * total
  const grade =
    points < needed
      ? section.gradeMin + ((section.gradePass - section.gradeMin) * points) / needed
      : section.gradePass + ((section.gradeMax - section.gradePass) * (points - needed)) / (total - needed)
  return roundGrade(section, Math.min(section.gradeMax, Math.max(section.gradeMin, grade)))
}

// En escalas cortas (1 a 7, 0 a 10, 0 a 20) se usa un decimal; en las de 0 a 100, enteros
export function roundGrade(section: Section, grade: number) {
  return section.gradeMax - section.gradeMin <= 20 ? Math.round(grade * 10) / 10 : Math.round(grade)
}

export function formatGrade(section: Section, grade: number) {
  const rounded = roundGrade(section, grade)
  return section.gradeMax - section.gradeMin <= 20 ? rounded.toFixed(1).replace('.', ',') : String(rounded)
}

export interface Average {
  average: number | null // ponderado, solo con lo ya evaluado
  evaluated: number // porcentaje con nota
  remaining: number // porcentaje sin nota todavía
  needed: number | null // la nota que hace falta en lo que queda para aprobar
}

// ── Requisitos ─────────────────────────────────────────────────────────

export type RuleState = 'met' | 'failed' | 'pending'
export interface RuleStatus {
  state: RuleState
  detail: string // "Llevas 4,5", "Te falta la nota del examen"
}

type GradedItem = { id: string; weight: number | null; grade: number | null; title: string }

// Las evaluaciones de un requisito; sin evaluaciones marcadas, todas las que tienen porcentaje
// (menos aquellas de las que se exime, que no cuentan para eximirse)
function ruleGroup(rule: Rule, items: GradedItem[]) {
  if (rule.itemIds) return items.filter((item) => rule.itemIds!.includes(item.id))
  return items.filter((item) => item.weight && !rule.exemptIds?.includes(item.id))
}

// El promedio del grupo: ponderado si tienen porcentaje, si no, simple
function groupAverage(graded: GradedItem[]) {
  const weighted = graded.every((item) => item.weight)
  const total = graded.reduce((sum, item) => sum + (weighted ? item.weight! : 1), 0)
  return total > 0 ? graded.reduce((sum, item) => sum + item.grade! * (weighted ? item.weight! : 1), 0) / total : null
}

// Cómo va cada requisito según las notas que ya hay
export function describeRule(section: Section, rule: Rule, items: GradedItem[]): RuleStatus {
  const group = ruleGroup(rule, items)
  if (group.length === 0) return { state: 'pending', detail: 'Sus evaluaciones ya no están.' }
  const graded = group.filter((item) => item.grade !== null)
  const missing = group.length - graded.length

  if (rule.kind === 'each') {
    const low = graded.filter((item) => item.grade! < rule.min)
    if (low.length > 0) return { state: 'failed', detail: `${low.map((item) => item.title).join(', ')} bajo ${formatGrade(section, rule.min)}.` }
    if (missing > 0) return { state: 'pending', detail: missing === 1 ? 'Falta 1 nota.' : `Faltan ${missing} notas.` }
    return { state: 'met', detail: 'Lo cumples.' }
  }

  const average = groupAverage(graded)
  const current = average === null ? 'Aún sin notas.' : `Llevas ${formatGrade(section, average)}.`
  if (missing > 0 || average === null) return { state: 'pending', detail: current }
  const reached = average >= rule.min - 1e-9
  // No eximirse no es reprobar: solo se rinde el examen
  if (rule.kind === 'exempt') return { state: reached ? 'met' : 'pending', detail: reached ? `Te eximes: tienes ${formatGrade(section, average)}.` : `No te eximes: tienes ${formatGrade(section, average)}. Rindes el examen.` }
  return { state: reached ? 'met' : 'failed', detail: `Tienes ${formatGrade(section, average)}.` }
}

export interface Exemption {
  rule: Rule
  titles: string[] // de qué se exime, como "Examen"
  weight: number // cuánto pesaban en la nota final
  excludedIds: Set<string>
}

// Una eximición que todavía se puede lograr. Mientras sea posible, la nota se calcula como si la persona
// se fuera a eximir: sin esas evaluaciones. Deja de serlo si ya rindió el examen (tiene nota), o si ya están
// todas las notas para eximirse y no le alcanzó.
export function findExemption(section: Section, items: GradedItem[]): Exemption | null {
  for (const rule of section.rules) {
    if (rule.kind !== 'exempt' || !rule.exemptIds?.length) continue
    const exempted = items.filter((item) => rule.exemptIds!.includes(item.id))
    if (exempted.length === 0 || exempted.some((item) => item.grade !== null)) continue

    const group = ruleGroup(rule, items)
    const graded = group.filter((item) => item.grade !== null)
    const average = groupAverage(graded)
    if (group.length > 0 && graded.length === group.length && average !== null && average < rule.min - 1e-9) continue

    return {
      rule,
      titles: exempted.map((item) => item.title),
      weight: exempted.reduce((sum, item) => sum + (item.weight ?? 0), 0),
      excludedIds: new Set(exempted.map((item) => item.id)),
    }
  }
  return null
}

// Con una eximición, lo que se exime no cuenta y el resto se reparte la nota completa
export function computeAverage(
  section: Section,
  items: { id: string; weight: number | null; grade: number | null }[],
  exemption: Exemption | null = null,
): Average {
  const counted = exemption ? items.filter((item) => !exemption.excludedIds.has(item.id)) : items
  const base = Math.max(0, 100 - (exemption?.weight ?? 0))
  const graded = counted.filter((item) => item.grade !== null && item.weight !== null && item.weight > 0)
  const evaluated = graded.reduce((sum, item) => sum + item.weight!, 0)
  const points = graded.reduce((sum, item) => sum + item.grade! * item.weight!, 0)
  const remaining = Math.max(0, base - evaluated)
  return {
    average: evaluated > 0 ? points / evaluated : null,
    evaluated: base > 0 ? (evaluated / base) * 100 : 0,
    remaining: base > 0 ? (remaining / base) * 100 : 0,
    needed: remaining > 0 ? (section.gradePass * base - points) / remaining : null,
  }
}
