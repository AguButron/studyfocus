// El panel de estadísticas y el resumen que aparece al volver de una sala
import { getSpaces, loadSpaces } from './spaces'

interface Companion {
  name: string
  seconds: number
}

interface Stats {
  today: number
  week: number
  total: number
  streak: number
  days: { date: string; seconds: number }[]
  companions: Companion[]
}

export interface StudySummary {
  seconds: number
  companions: Companion[]
}

const SUMMARY_KEY = 'studyfocus.summary'

const todayText = document.querySelector<HTMLElement>('#stat-today')!
const weekText = document.querySelector<HTMLElement>('#stat-week')!
const streakText = document.querySelector<HTMLElement>('#stat-streak')!
const totalText = document.querySelector<HTMLElement>('#stat-total')!
const messageText = document.querySelector<HTMLParagraphElement>('#stats-message')!
const chart = document.querySelector<HTMLDivElement>('#stat-chart')!
const companionsEmpty = document.querySelector<HTMLParagraphElement>('#companions-empty')!
const companionsList = document.querySelector<HTMLUListElement>('#companions-list')!
const sectionTimeBox = document.querySelector<HTMLDivElement>('#section-time-box')!
const sectionTimeList = document.querySelector<HTMLUListElement>('#section-time-list')!
const summaryCard = document.querySelector<HTMLDivElement>('#session-summary')!
const summaryText = document.querySelector<HTMLParagraphElement>('#session-summary-text')!
const summaryStatsButton = document.querySelector<HTMLButtonElement>('#session-summary-stats')!
const summaryCloseButton = document.querySelector<HTMLButtonElement>('#session-summary-close')!

// Los días llegan como fechas sin hora: se leen en UTC para que no cambien de día
const weekdayFormat = new Intl.DateTimeFormat('es', { weekday: 'short', timeZone: 'UTC' })
const longDateFormat = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) return seconds > 0 ? '< 1 min' : '0 min'

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${minutes} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

function formatShortDuration(seconds: number) {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
}

function listNames(companions: Companion[]) {
  const names = companions.map((companion) => companion.name)
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

// Las barras de los últimos 7 días; también se usan en la página del perfil de otra persona
export function renderChart(days: Stats['days'], target: HTMLElement = chart) {
  const max = Math.max(...days.map((day) => day.seconds), 1)
  const today = days[days.length - 1].date

  target.replaceChildren(
    ...days.map((day) => {
      const date = new Date(`${day.date}T00:00:00Z`)
      const column = document.createElement('div')
      column.className = 'stat-column'
      column.setAttribute('role', 'listitem')
      column.setAttribute('aria-label', `${longDateFormat.format(date)}: ${formatDuration(day.seconds)}`)
      if (day.date === today) column.classList.add('today')

      const value = document.createElement('span')
      value.className = 'stat-value'
      value.textContent = day.seconds >= 60 ? formatShortDuration(day.seconds) : ''

      const track = document.createElement('div')
      track.className = 'stat-track'
      const bar = document.createElement('div')
      bar.className = 'stat-bar'
      bar.style.height = `${(day.seconds / max) * 100}%`
      track.append(bar)

      const label = document.createElement('span')
      label.className = 'stat-day'
      label.textContent = day.date === today ? 'Hoy' : weekdayFormat.format(date).replace('.', '')

      column.append(value, track, label)
      return column
    }),
  )
}

function showMessage(text: string, isError = false) {
  messageText.textContent = text
  messageText.classList.toggle('sf-error', isError)
}

function render(stats: Stats) {
  todayText.textContent = formatDuration(stats.today)
  weekText.textContent = formatDuration(stats.week)
  streakText.textContent = stats.streak === 1 ? '1 día' : `${stats.streak} días`
  totalText.textContent = formatDuration(stats.total)
  showMessage(stats.total === 0 ? 'Todavía no hay tiempo registrado. Ve a Estudiar y comienza el temporizador.' : '')
  renderChart(stats.days)

  companionsEmpty.hidden = stats.companions.length > 0
  companionsList.replaceChildren(
    ...stats.companions.map((companion) => {
      const item = document.createElement('li')
      item.className = 'sf-row'
      const text = document.createElement('div')
      text.className = 'sf-row-main'
      const name = document.createElement('strong')
      name.className = 'sf-row-title'
      name.textContent = companion.name
      const time = document.createElement('span')
      time.className = 'sf-row-detail'
      time.textContent = `${formatDuration(companion.seconds)} juntos esta semana`
      text.append(name, time)
      item.append(text)
      return item
    }),
  )
}

// Nulo si no se pudieron cargar; el error queda en el panel de estadísticas
export async function loadStats(): Promise<Stats | null> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  try {
    const response = await fetch(`/api/stats?tz=${encodeURIComponent(timeZone)}`)
    const result = await response.json()
    if (!response.ok) {
      showMessage(result.error ?? 'No se pudieron cargar las estadísticas.', true)
      return null
    }
    return result
  } catch {
    showMessage('No se pudo conectar con el servidor.', true)
    return null
  }
}

// Las horas de cada apartado en los últimos 7 días, de mayor a menor
async function renderSectionTime() {
  await loadSpaces()
  const sections = getSpaces()
    .flatMap((space) => space.sections.map((section) => ({ section, space })))
    .filter(({ section }) => section.weekSeconds > 0)
    .sort((a, b) => b.section.weekSeconds - a.section.weekSeconds)
  const max = Math.max(1, ...sections.map(({ section }) => section.weekSeconds))

  sectionTimeBox.hidden = sections.length === 0
  sectionTimeList.replaceChildren(
    ...sections.map(({ section, space }) => {
      const row = document.createElement('li')
      row.className = 'section-time'
      row.style.setProperty('--section', section.color)
      const name = document.createElement('span')
      name.className = 'section-time-name'
      name.textContent = section.name
      name.title = `${section.name} · ${space.name}`
      const bar = document.createElement('span')
      bar.className = 'section-time-bar'
      const fill = document.createElement('span')
      fill.style.width = `${(section.weekSeconds / max) * 100}%`
      bar.append(fill)
      const value = document.createElement('span')
      value.className = 'section-time-value'
      value.textContent = formatDuration(section.weekSeconds)
      row.append(name, bar, value)
      return row
    }),
  )
}

export async function refreshStats() {
  renderSectionTime()
  const stats = await loadStats()
  if (stats) render(stats)
}

// La página se recarga al salir de la sala: el resumen se guarda para mostrarlo en el menú
export function saveSummary(summary: StudySummary | null) {
  try {
    if (summary) {
      sessionStorage.setItem(SUMMARY_KEY, JSON.stringify(summary))
    }
  } catch {
    // Sin almacenamiento, el resumen no aparece
  }
}

function takeSummary(): StudySummary | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SUMMARY_KEY) ?? 'null')
    sessionStorage.removeItem(SUMMARY_KEY)
    return typeof saved?.seconds === 'number' && Array.isArray(saved.companions) ? saved : null
  } catch {
    return null
  }
}

export function setUpSummary(onOpenStats: () => void) {
  summaryCloseButton.addEventListener('click', () => {
    summaryCard.hidden = true
  })
  summaryStatsButton.addEventListener('click', () => {
    summaryCard.hidden = true
    onOpenStats()
  })
}

export function showSavedSummary() {
  const summary = takeSummary()
  if (!summary) return

  const studied =
    summary.seconds >= 60
      ? `Estudiaste ${formatDuration(summary.seconds)}`
      : 'No alcanzaste a terminar un periodo de estudio'
  const company = summary.companions.length > 0 ? `, junto a ${listNames(summary.companions)}` : ''
  summaryText.textContent = `${studied}${company}.`
  summaryCard.hidden = false
}
