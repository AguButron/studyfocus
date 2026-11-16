// La agenda: pruebas, tareas, trabajos, presentaciones y recordatorios. Aquí están las llamadas al
// servidor y las fechas. Una fecha es un día del calendario escrito como '2026-11-14', sin hora ni zona.
import { callApi } from './api'

export type AgendaKind = 'prueba' | 'tarea' | 'trabajo' | 'presentacion' | 'recordatorio'

export interface AgendaItem {
  id: string
  kind: AgendaKind
  title: string
  notes: string | null
  date: string | null // sin fecha todavía: queda en su apartado, fuera del calendario
  time: string | null // como '10:30'
  remindDays: number | null // cuántos días antes avisar; nulo es sin aviso
  done: boolean
  sectionId: string | null // el apartado (ramo, parte) al que pertenece
  weight: number | null // el porcentaje de la nota del apartado
  grade: number | null
}

export type AgendaDraft = Omit<AgendaItem, 'id' | 'done'>

export const KINDS: { id: AgendaKind; name: string }[] = [
  { id: 'prueba', name: 'Prueba' },
  { id: 'tarea', name: 'Tarea' },
  { id: 'trabajo', name: 'Trabajo' },
  { id: 'presentacion', name: 'Presentación' },
  { id: 'recordatorio', name: 'Recordatorio' },
]

// Lo que se propone al crear cada tipo: una prueba se avisa con más tiempo
export const DEFAULT_REMIND_DAYS: Record<AgendaKind, number> = {
  prueba: 3,
  tarea: 1,
  trabajo: 2,
  presentacion: 2,
  recordatorio: 0,
}

export function kindName(kind: AgendaKind) {
  return KINDS.find(({ id }) => id === kind)?.name ?? ''
}

// Las pruebas no se marcan como hechas: pasan solas
export function canBeDone(kind: AgendaKind) {
  return kind !== 'prueba'
}

const call = <T>(path: string, body?: unknown) => callApi<T>(`/api/agenda${path}`, body)

export async function loadRange(from: string, to: string) {
  const result = await call<{ items: AgendaItem[] }>(`?desde=${from}&hasta=${to}`)
  return result.value ? { value: result.value.items, error: null } : result
}

export async function loadReminders(today: string) {
  const result = await call<{ items: AgendaItem[] }>(`/avisos?hoy=${today}`)
  return result.value ? { value: result.value.items, error: null } : result
}

// Todo lo de un apartado, sin importar la fecha
export async function loadSectionItems(sectionId: string) {
  const result = await call<{ items: AgendaItem[] }>(`?apartado=${sectionId}`)
  return result.value ? { value: result.value.items, error: null } : result
}

export function createItem(draft: AgendaDraft) {
  return call<AgendaItem>('', draft)
}

export function updateItem(id: string, draft: AgendaDraft) {
  return call<AgendaItem>('/editar', { id, ...draft })
}

// Cambia solo la fecha. Sin fecha sale del calendario y queda en su apartado, con su porcentaje y su nota.
export function moveItem(item: AgendaItem, date: string | null) {
  return updateItem(item.id, { ...item, date })
}

export function setItemDone(id: string, done: boolean) {
  return call<AgendaItem>('/hecha', { id, done })
}

export function deleteItem(id: string) {
  return call<AgendaItem>('/borrar', { id })
}

// El orden propio de las cosas de un apartado, como quedaron al arrastrarlas
export function reorderSectionItems(sectionId: string, ids: string[]) {
  return call<{ ok: true }>('/ordenar', { sectionId, ids })
}

// Deshace un borrado reciente: vuelve tal cual estaba, con su nota y su apartado
export function restoreItem(id: string) {
  return call<AgendaItem>('/restaurar', { id })
}

// ── Fechas ─────────────────────────────────────────────────────────────

const pad = (value: number) => String(value).padStart(2, '0')

export function toDateText(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Un día del calendario como fecha local, al mediodía para que ningún cambio de horario lo mueva de día
export function fromDateText(text: string) {
  const [year, month, day] = text.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function todayText() {
  return toDateText(new Date())
}

export function addDays(text: string, days: number) {
  const date = fromDateText(text)
  date.setDate(date.getDate() + days)
  return toDateText(date)
}

export function daysFrom(from: string, to: string) {
  return Math.round((fromDateText(to).getTime() - fromDateText(from).getTime()) / (24 * 60 * 60 * 1000))
}

// Las semanas parten el lunes
export function startOfWeek(text: string) {
  const weekday = (fromDateText(text).getDay() + 6) % 7
  return addDays(text, -weekday)
}

export function startOfMonth(text: string) {
  return `${text.slice(0, 8)}01`
}

export function addMonths(text: string, months: number) {
  const date = fromDateText(startOfMonth(text))
  date.setMonth(date.getMonth() + months)
  return toDateText(date)
}
