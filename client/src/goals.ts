// Los objetivos de estudio: "quiero estudiar 8 horas antes del viernes", de un ramo o en general.
// Se crean desde Inicio o mientras se estudia, y cada uno muestra una barra con su avance.
// Mientras corre un periodo de estudio, la barra suma lo que va del periodo (el servidor lo guarda al terminarlo).
import { addDays, todayText } from './agenda'
import { describeKind, ensureSpaces, findSection, getSpaces } from './spaces'
import { formatDuration } from './stats'
import { showNotice } from './undoToast'

export interface Goal {
  id: string
  sectionId: string | null
  minutes: number
  deadline: string
  startsAt: string
  seconds: number
  isEnded: boolean
}

// Lo que va del periodo de estudio en curso, que todavía no está guardado: lo da el temporizador
type LiveStudy = { sectionId: string | null; seconds: number } | null

const CELEBRATED_KEY = 'studyfocus.goalsCelebrated'
const GENERAL_COLOR = 'var(--marker)'

const dialog = document.querySelector<HTMLDialogElement>('#goal-dialog')!
const form = document.querySelector<HTMLFormElement>('#goal-form')!
const titleText = document.querySelector<HTMLHeadingElement>('#goal-dialog-title')!
const hoursInput = document.querySelector<HTMLInputElement>('#goal-hours')!
const deadlineInput = document.querySelector<HTMLInputElement>('#goal-deadline')!
const sectionSelect = document.querySelector<HTMLSelectElement>('#goal-section')!
const errorText = document.querySelector<HTMLParagraphElement>('#goal-error')!
const deleteButton = document.querySelector<HTMLButtonElement>('#goal-delete')!

const weekdayFormat = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', timeZone: 'UTC' })
const dateFormat = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

let goals: Goal[] = []
let editing: Goal | null = null
let liveSource: () => LiveStudy = () => null
const containers: { list: HTMLElement; empty: HTMLElement | null; compact: boolean }[] = []

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

async function call(path: string, body?: Record<string, unknown>) {
  try {
    const response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify({ ...body, tz: timeZone() }) : undefined,
    })
    const result = await response.json()
    if (!response.ok) return result.error ?? 'No se pudo completar.'
    goals = result.goals
    renderAll()
    return null
  } catch {
    return 'No se pudo conectar con el servidor.'
  }
}

export function loadGoals() {
  return call(`/api/objetivos?tz=${encodeURIComponent(timeZone())}`)
}

// ── El avance ──────────────────────────────────────────────────────────

// Lo estudiado para el objetivo, contando lo que va del periodo en curso si es del mismo ramo
function studiedSeconds(goal: Goal) {
  const live = goal.isEnded ? null : liveSource()
  if (!live || (goal.sectionId !== null && goal.sectionId !== live.sectionId)) return goal.seconds
  // Un objetivo creado a mitad del periodo solo suma desde que se creó
  const sinceCreated = Math.max(0, (Date.now() - Date.parse(goal.startsAt)) / 1000)
  return goal.seconds + Math.min(live.seconds, sinceCreated)
}

function describeDeadline(goal: Goal) {
  const today = todayText()
  if (goal.deadline === today) return 'para hoy'
  if (goal.deadline === addDays(today, 1)) return 'para mañana'
  const date = new Date(`${goal.deadline}T00:00:00Z`)
  const daysLeft = Math.round((date.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86400000)
  return daysLeft < 7 ? `para el ${weekdayFormat.format(date)}` : `para el ${dateFormat.format(date).replace('.', '')}`
}

function describeGoal(goal: Goal) {
  const found = goal.sectionId ? findSection(goal.sectionId) : null
  const target = formatDuration(goal.minutes * 60)
  return { title: found ? `${target} de ${found.section.name}` : target, color: found?.section.color ?? GENERAL_COLOR }
}

function createGoalRow(goal: Goal, compact: boolean) {
  const studied = studiedSeconds(goal)
  const target = goal.minutes * 60
  const isDone = studied >= target
  const { title, color } = describeGoal(goal)

  const row = document.createElement('li')
  row.className = 'goal'
  row.style.setProperty('--goal', color)
  row.toggleAttribute('data-done', isDone)
  row.toggleAttribute('data-missed', goal.isEnded && !isDone)

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'goal-open'
  button.title = 'Editar el objetivo'
  button.addEventListener('click', () => openGoalDialog(goal))

  const head = document.createElement('span')
  head.className = 'goal-head'
  const name = document.createElement('strong')
  name.textContent = title
  const when = document.createElement('span')
  when.className = 'goal-when'
  when.textContent = goal.isEnded ? 'terminó' : describeDeadline(goal)
  head.append(name, when)

  const bar = document.createElement('span')
  bar.className = 'goal-bar'
  bar.setAttribute('role', 'progressbar')
  bar.setAttribute('aria-valuemin', '0')
  bar.setAttribute('aria-valuemax', '100')
  const share = Math.min(1, studied / target)
  bar.setAttribute('aria-valuenow', String(Math.round(share * 100)))
  const fill = document.createElement('span')
  fill.style.width = `${share * 100}%`
  bar.append(fill)

  const detail = document.createElement('span')
  detail.className = 'goal-detail'
  if (isDone) {
    detail.textContent = `Cumplido ✓ · ${formatDuration(studied)}`
  } else if (goal.isEnded) {
    detail.textContent = `No alcanzado: ${formatDuration(studied)} de ${formatDuration(target)}`
  } else {
    // Cuánto falta, y cuánto sería por día hasta la fecha límite (contando hoy)
    const missing = target - studied
    const days = Math.round((Date.parse(`${goal.deadline}T00:00:00Z`) - Date.parse(`${todayText()}T00:00:00Z`)) / 86400000) + 1
    const perDay = days > 1 && !compact ? ` · ${formatDuration(missing / days)} por día` : ''
    detail.textContent = `${formatDuration(studied)} de ${formatDuration(target)} · faltan ${formatDuration(missing)}${perDay}`
  }

  button.append(head, bar, detail)
  row.append(button)
  return row
}

// Un aviso la primera vez que un objetivo se cumple, aunque sea a mitad de un periodo
function celebrate() {
  let celebrated: string[] = []
  try {
    celebrated = JSON.parse(localStorage.getItem(CELEBRATED_KEY) ?? '[]')
  } catch {
    // Sin almacenamiento, el aviso puede repetirse al recargar
  }
  const done = goals.filter((goal) => !goal.isEnded && studiedSeconds(goal) >= goal.minutes * 60)
  const fresh = done.filter((goal) => !celebrated.includes(goal.id))
  if (fresh.length === 0) return
  showNotice(`¡Cumpliste tu objetivo: ${describeGoal(fresh[0]).title}!`)
  try {
    // Solo se recuerdan los que siguen existiendo
    const ids = new Set(goals.map((goal) => goal.id))
    localStorage.setItem(CELEBRATED_KEY, JSON.stringify([...celebrated.filter((id) => ids.has(id)), ...fresh.map((goal) => goal.id)]))
  } catch {
    // Sin almacenamiento, el aviso puede repetirse al recargar
  }
}

export function renderAll() {
  for (const { list, empty, compact } of containers) {
    // En el temporizador solo los que siguen corriendo; en Inicio también los que terminaron hace poco
    const shown = compact ? goals.filter((goal) => !goal.isEnded) : goals
    list.replaceChildren(...shown.map((goal) => createGoalRow(goal, compact)))
    if (empty) empty.hidden = shown.length > 0
  }
  celebrate()
}

// Una lista de objetivos en la página (Inicio, o compacta en el temporizador)
export function showGoalsIn(list: HTMLElement, empty: HTMLElement | null, compact = false) {
  containers.push({ list, empty, compact })
}

export function setLiveStudy(source: () => LiveStudy) {
  liveSource = source
}

// ── La ventana para crear o editar ─────────────────────────────────────

function fillSections(selected: string | null) {
  const groups = getSpaces()
    .filter((space) => !space.archived && space.sections.length > 0)
    .map((space) => {
      const group = document.createElement('optgroup')
      group.label = `${space.name} · ${describeKind(space.kind).sections}`
      group.append(...space.sections.map((section) => new Option(section.code ? `${section.name} (${section.code})` : section.name, section.id)))
      return group
    })
  sectionSelect.replaceChildren(new Option('En general (cualquier ramo)', ''), ...groups)
  sectionSelect.value = selected && findSection(selected) ? selected : ''
}

// Sin objetivo, crea uno nuevo; sectionId propone ese ramo (el que se está estudiando)
export async function openGoalDialog(goal: Goal | null, sectionId: string | null = null) {
  editing = goal
  errorText.textContent = ''
  titleText.textContent = goal ? 'Editar objetivo' : 'Nuevo objetivo'
  hoursInput.value = goal ? String(Math.round((goal.minutes / 60) * 100) / 100).replace('.', ',') : ''
  deadlineInput.min = todayText()
  deadlineInput.value = goal ? goal.deadline : todayText()
  deleteButton.hidden = !goal
  await ensureSpaces()
  fillSections(goal ? goal.sectionId : sectionId)
  dialog.showModal()
  hoursInput.focus()
}

export function setUpGoals() {
  hoursInput.addEventListener('input', () => hoursInput.setCustomValidity(''))
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const hours = Number(hoursInput.value.replace(',', '.'))
    if (!Number.isFinite(hours) || hours <= 0) {
      errorText.textContent = 'Escribe cuántas horas quieres estudiar, por ejemplo 8 o 1,5.'
      return
    }
    const body = {
      minutes: Math.round(hours * 60),
      deadline: deadlineInput.value,
      sectionId: sectionSelect.value || null,
    }
    const error = editing ? await call('/api/objetivos/editar', { id: editing.id, ...body }) : await call('/api/objetivos', body)
    if (error) {
      errorText.textContent = error
      return
    }
    dialog.close()
  })
  document.querySelector('#goal-cancel')!.addEventListener('click', () => dialog.close())
  deleteButton.addEventListener('click', async () => {
    if (!editing) return
    const error = await call('/api/objetivos/borrar', { id: editing.id })
    if (error) errorText.textContent = error
    else dialog.close()
  })
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-new-goal]')) {
    button.addEventListener('click', () => openGoalDialog(null, button.dataset.newGoal === 'study' ? (liveSource()?.sectionId ?? currentSection()) : null))
  }
}

// El ramo elegido en el temporizador, aunque todavía no se haya empezado a estudiar
let currentSection: () => string | null = () => null
export function setCurrentSection(source: () => string | null) {
  currentSection = source
}
