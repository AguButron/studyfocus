// El panel de estadísticas y el resumen que aparece al volver de una sala
import { addDays, todayText } from './agenda'
import { findSection, loadSpaces } from './spaces'

interface Companion {
  name: string
  seconds: number
}

type Bucket = 'day' | 'week' | 'month' | 'year'

// Lo de un período elegido: el total, las barras (por día, semana, mes o año), los apartados y la compañía
interface RangeStats {
  from: string
  to: string
  seconds: number
  activeDays: number
  dailyAverage: number
  bucket: Bucket
  bars: { date: string; seconds: number }[]
  sections: { sectionId: string; seconds: number }[]
  companions: Companion[]
}

interface Stats {
  today: number
  week: number
  total: number
  streak: number
  days: { date: string; seconds: number }[]
  companions: Companion[]
  range?: RangeStats
}

// Los períodos que se pueden elegir; "custom" es entre dos fechas
type RangeChoice = '7' | '30' | '90' | '365' | 'all' | 'custom'
const RANGE_KEY = 'studyfocus.statsRange'
const RANGE_LABELS: Record<Exclude<RangeChoice, 'custom'>, string> = {
  '7': 'Últimos 7 días',
  '30': 'Últimos 30 días',
  '90': 'Últimos 90 días',
  '365': 'Último año',
  all: 'Desde siempre',
}
const BUCKET_TITLES: Record<Bucket, string> = { day: 'Por día', week: 'Por semana', month: 'Por mes', year: 'Por año' }

export interface StudySummary {
  seconds: number
  companions: Companion[]
}

const SUMMARY_KEY = 'studyfocus.summary'

const todayStat = document.querySelector<HTMLElement>('#stat-today')!
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
const rangeSelect = document.querySelector<HTMLSelectElement>('#stats-range')!
const customForm = document.querySelector<HTMLFormElement>('#stats-custom')!
const fromInput = document.querySelector<HTMLInputElement>('#stats-from')!
const toInput = document.querySelector<HTMLInputElement>('#stats-to')!
const rangeLabel = document.querySelector<HTMLElement>('#stat-range-label')!
const rangeDetail = document.querySelector<HTMLElement>('#stat-range-detail')!
const chartTitle = document.querySelector<HTMLElement>('#stat-chart-title')!
const sectionTimeTitle = document.querySelector<HTMLElement>('#section-time-title')!

// Los días llegan como fechas sin hora: se leen en UTC para que no cambien de día
const weekdayFormat = new Intl.DateTimeFormat('es', { weekday: 'short', timeZone: 'UTC' })
const longDateFormat = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const shortDateFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fullDateFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthFormat = new Intl.DateTimeFormat('es', { month: 'short', timeZone: 'UTC' })
const monthYearFormat = new Intl.DateTimeFormat('es', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const longMonthFormat = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const MAX_LABELS = 12 // con más barras, solo algunas llevan su etiqueta para que no se encimen
const MAX_VALUES = 14 // con más barras, los minutos van solo en la descripción de cada una

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

// Las barras de un período: por día, por semana, por mes o por año
function renderRangeChart(range: RangeStats) {
  const { bars, bucket } = range
  const max = Math.max(...bars.map((bar) => bar.seconds), 1)
  const today = todayText()
  const spansYears = bars.length > 0 && bars[0].date.slice(0, 4) !== bars[bars.length - 1].date.slice(0, 4)
  const labelEvery = Math.ceil(bars.length / MAX_LABELS)

  const describe = (date: Date) =>
    bucket === 'day'
      ? longDateFormat.format(date)
      : bucket === 'week'
        ? `Semana del ${shortDateFormat.format(date)}`
        : bucket === 'month'
          ? longMonthFormat.format(date)
          : String(date.getUTCFullYear())
  const label = (date: Date, isToday: boolean) => {
    if (bucket === 'day') return isToday ? 'Hoy' : bars.length <= 7 ? weekdayFormat.format(date).replace('.', '') : String(date.getUTCDate())
    if (bucket === 'week') return shortDateFormat.format(date).replace('.', '')
    if (bucket === 'month') return (spansYears ? monthYearFormat : monthFormat).format(date).replace('.', '')
    return String(date.getUTCFullYear())
  }

  chart.style.gridTemplateColumns = `repeat(${bars.length}, minmax(0, 1fr))`
  chart.toggleAttribute('data-dense', bars.length > MAX_VALUES)
  chart.replaceChildren(
    ...bars.map((bar, index) => {
      const date = new Date(`${bar.date}T00:00:00Z`)
      const isToday = bucket === 'day' && bar.date === today
      const column = document.createElement('div')
      column.className = 'stat-column'
      column.setAttribute('role', 'listitem')
      column.setAttribute('aria-label', `${describe(date)}: ${formatDuration(bar.seconds)}`)
      column.title = `${describe(date)}: ${formatDuration(bar.seconds)}`
      if (isToday) column.classList.add('today')

      const value = document.createElement('span')
      value.className = 'stat-value'
      value.textContent = bars.length <= MAX_VALUES && bar.seconds >= 60 ? formatShortDuration(bar.seconds) : ''

      const track = document.createElement('div')
      track.className = 'stat-track'
      const fill = document.createElement('div')
      fill.className = 'stat-bar'
      fill.style.height = `${(bar.seconds / max) * 100}%`
      track.append(fill)

      const day = document.createElement('span')
      day.className = 'stat-day'
      // Con muchas barras, la etiqueta va cada tanto, contando desde la última (la más reciente)
      day.textContent = (bars.length - 1 - index) % labelEvery === 0 ? label(date, isToday) : ''

      column.append(value, track, day)
      return column
    }),
  )
}

function showMessage(text: string, isError = false) {
  messageText.textContent = text
  messageText.classList.toggle('sf-error', isError)
}

function describeRange(range: RangeStats) {
  const choice = readChoice()
  if (choice !== 'custom') return RANGE_LABELS[choice]
  return range.from === range.to
    ? fullDateFormat.format(new Date(`${range.from}T00:00:00Z`))
    : `${fullDateFormat.format(new Date(`${range.from}T00:00:00Z`))} – ${fullDateFormat.format(new Date(`${range.to}T00:00:00Z`))}`
}

function render(stats: Stats) {
  todayStat.textContent = formatDuration(stats.today)
  streakText.textContent = stats.streak === 1 ? '1 día' : `${stats.streak} días`
  totalText.textContent = formatDuration(stats.total)
  showMessage(stats.total === 0 ? 'Todavía no hay tiempo registrado. Ve a Estudiar y comienza el temporizador.' : '')

  const range = stats.range
  if (range) {
    weekText.textContent = formatDuration(range.seconds)
    rangeLabel.textContent = describeRange(range)
    rangeDetail.textContent =
      range.seconds > 0
        ? `${formatDuration(range.dailyAverage)} por día · ${range.activeDays === 1 ? '1 día' : `${range.activeDays} días`} con estudio`
        : ''
    chartTitle.textContent = BUCKET_TITLES[range.bucket]
    renderRangeChart(range)
    renderSectionTime(range)
  } else {
    weekText.textContent = formatDuration(stats.week)
    renderChart(stats.days)
  }

  const companions = range?.companions ?? stats.companions
  companionsEmpty.hidden = companions.length > 0
  companionsList.replaceChildren(
    ...companions.map((companion) => {
      const item = document.createElement('li')
      item.className = 'sf-row'
      const text = document.createElement('div')
      text.className = 'sf-row-main'
      const name = document.createElement('strong')
      name.className = 'sf-row-title'
      name.textContent = companion.name
      const time = document.createElement('span')
      time.className = 'sf-row-detail'
      time.textContent = `${formatDuration(companion.seconds)} juntos`
      text.append(name, time)
      item.append(text)
      return item
    }),
  )
}

// Nulo si no se pudieron cargar; el error queda en el panel de estadísticas.
// Con un período (from nulo: desde siempre), también trae sus números
export async function loadStats(range?: { from: string | null; to: string }): Promise<Stats | null> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const params = new URLSearchParams({ tz: timeZone })
  if (range) {
    params.set('desde', range.from ?? 'inicio')
    params.set('hasta', range.to)
  }
  try {
    const response = await fetch(`/api/stats?${params}`)
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

// Las horas de cada apartado en el período, de mayor a menor. Uno que ya se borró no aparece.
async function renderSectionTime(range: RangeStats) {
  await loadSpaces()
  const sections = range.sections.flatMap(({ sectionId, seconds }) => {
    const found = findSection(sectionId)
    return found ? [{ ...found, seconds }] : []
  })
  const max = Math.max(1, ...sections.map(({ seconds }) => seconds))
  sectionTimeTitle.textContent = `Por apartado · ${describeRange(range).toLowerCase()}`

  sectionTimeBox.hidden = sections.length === 0
  sectionTimeList.replaceChildren(
    ...sections.map(({ section, space, seconds }) => {
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
      fill.style.width = `${(seconds / max) * 100}%`
      bar.append(fill)
      const value = document.createElement('span')
      value.className = 'section-time-value'
      value.textContent = formatDuration(seconds)
      row.append(name, bar, value)
      return row
    }),
  )
}

// El período elegido se recuerda en este navegador
function readChoice(): RangeChoice {
  const value = rangeSelect.value
  return (['7', '30', '90', '365', 'all', 'custom'] as const).includes(value as RangeChoice) ? (value as RangeChoice) : '7'
}

function saveChoice() {
  try {
    localStorage.setItem(RANGE_KEY, JSON.stringify({ choice: readChoice(), from: fromInput.value, to: toInput.value }))
  } catch {
    // Sin almacenamiento, vuelve a los últimos 7 días
  }
}

function restoreChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(RANGE_KEY) ?? 'null')
    if (saved?.choice) rangeSelect.value = saved.choice
    if (typeof saved?.from === 'string') fromInput.value = saved.from
    if (typeof saved?.to === 'string') toInput.value = saved.to
  } catch {
    // Se queda en los últimos 7 días
  }
  if (rangeSelect.selectedIndex < 0) rangeSelect.value = '7'
}

// Los días que abarca lo elegido, en el calendario de la persona
function chosenRange(): { from: string | null; to: string } | null {
  const today = todayText()
  const choice = readChoice()
  if (choice === 'all') return { from: null, to: today }
  if (choice === 'custom') {
    if (!fromInput.value || !toInput.value) return null
    return fromInput.value <= toInput.value ? { from: fromInput.value, to: toInput.value } : { from: toInput.value, to: fromInput.value }
  }
  return { from: addDays(today, -(Number(choice) - 1)), to: today }
}

let statsRequest = 0 // descarta una respuesta vieja si mientras tanto se eligió otro período

export async function refreshStats() {
  customForm.hidden = readChoice() !== 'custom'
  const range = chosenRange()
  if (!range) return // entre fechas, hasta que se elijan las dos
  const current = ++statsRequest
  const stats = await loadStats(range)
  if (stats && current === statsRequest) render(stats)
}

export function setUpStatsRange() {
  restoreChoice()
  if (!toInput.value) toInput.value = todayText()
  if (!fromInput.value) fromInput.value = addDays(todayText(), -29)
  customForm.hidden = readChoice() !== 'custom'
  rangeSelect.addEventListener('change', () => {
    saveChoice()
    refreshStats()
  })
  customForm.addEventListener('submit', (event) => {
    event.preventDefault()
    saveChoice()
    refreshStats()
  })
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
