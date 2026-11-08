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
  weekSeconds: number // estudiado en los últimos 7 días
  totalSeconds: number
}

export interface Space {
  id: string
  kind: SpaceKind
  name: string
  archived: boolean
  sections: Section[]
}

export type SectionDraft = Pick<Section, 'name' | 'color' | 'code' | 'teacher' | 'place' | 'weeklyGoalMinutes'> & {
  scale: Pick<Section, 'gradeMin' | 'gradeMax' | 'gradePass' | 'exigencia'>
}

// Cómo se llaman las cosas según el tipo de espacio
export const SPACE_KINDS: { id: SpaceKind; name: string; sections: string; section: string; example: string }[] = [
  { id: 'semestre', name: 'Semestre', sections: 'Ramos', section: 'Ramo', example: '2026-1, Spring 2026' },
  { id: 'proyecto', name: 'Proyecto', sections: 'Partes', section: 'Parte', example: 'Mi app, Tesis' },
  { id: 'curso', name: 'Curso', sections: 'Módulos', section: 'Módulo', example: 'Inglés B2, Curso de Python' },
  { id: 'otro', name: 'Otro', sections: 'Secciones', section: 'Sección', example: 'Preuniversitario' },
]

export const DEFAULT_SCALE = { gradeMin: 1, gradeMax: 7, gradePass: 4, exigencia: 60 }

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

// Cómo se muestra el apartado de algo de la agenda: su sigla, o su nombre
export function describeItemSection(sectionId: string | null) {
  const found = findSection(sectionId)
  return found ? { label: found.section.code ?? found.section.name, color: found.section.color } : null
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

export function computeAverage(section: Section, items: { weight: number | null; grade: number | null }[]): Average {
  const graded = items.filter((item) => item.grade !== null && item.weight !== null && item.weight > 0)
  const evaluated = graded.reduce((sum, item) => sum + item.weight!, 0)
  const points = graded.reduce((sum, item) => sum + item.grade! * item.weight!, 0)
  const remaining = Math.max(0, 100 - evaluated)
  return {
    average: evaluated > 0 ? points / evaluated : null,
    evaluated,
    remaining,
    needed: remaining > 0 ? (section.gradePass * 100 - points) / remaining : null,
  }
}
