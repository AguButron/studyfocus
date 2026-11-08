// El calendario de Inicio: lo que viene esta semana o este mes, y los avisos de hoy
import {
  addDays,
  addMonths,
  daysFrom,
  fromDateText,
  kindName,
  loadRange,
  startOfMonth,
  startOfWeek,
  todayText,
  type AgendaItem,
} from './agenda'
import { openAgendaDialog } from './agendaDialog'

type View = 'week' | 'month' | 'year'

const VIEW_KEY = 'studyfocus.calendarView'
const MONTH_CELL_ITEMS = 3 // en el mes, lo que cabe en cada día antes de "y N más"

const grid = document.querySelector<HTMLDivElement>('#calendar-grid')!
const label = document.querySelector<HTMLElement>('#calendar-label')!
const errorText = document.querySelector<HTMLParagraphElement>('#calendar-error')!
const viewButtons = document.querySelectorAll<HTMLButtonElement>('[data-calendar-view]')

const weekdayFormat = new Intl.DateTimeFormat('es', { weekday: 'short' })
const monthFormat = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' })
const monthNameFormat = new Intl.DateTimeFormat('es', { month: 'long' })
const dayMonthFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' })
const longFormat = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })

let view: View = loadView()
let anchor = todayText() // un día dentro de lo que se está mirando
let request = 0 // descarta respuestas viejas si se cambió de semana mientras tanto

function loadView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    return saved === 'week' || saved === 'year' ? saved : 'month'
  } catch {
    return 'month' // por defecto se ve el mes
  }
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Lo que se ve: la semana de lunes a domingo, o el mes completo con las semanas de sus bordes
function visibleRange() {
  if (view === 'week') {
    const from = startOfWeek(anchor)
    return { from, to: addDays(from, 6) }
  }
  if (view === 'year') {
    const year = anchor.slice(0, 4)
    return { from: `${year}-01-01`, to: `${year}-12-31` }
  }
  const from = startOfWeek(startOfMonth(anchor))
  const lastDay = addDays(addMonths(anchor, 1), -1)
  return { from, to: addDays(startOfWeek(lastDay), 6) }
}

function describeRange(from: string, to: string) {
  if (view === 'month') return capitalize(monthFormat.format(fromDateText(anchor)))
  if (view === 'year') return anchor.slice(0, 4)

  const start = fromDateText(from)
  const end = fromDateText(to)
  const year = end.getFullYear()
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} al ${dayMonthFormat.format(end)} de ${year}`
  }
  return `${dayMonthFormat.format(start)} al ${dayMonthFormat.format(end)} de ${year}`
}

export function describeToday() {
  return capitalize(longFormat.format(new Date()))
}

function createChip(item: AgendaItem, isCompact: boolean) {
  const chip = document.createElement('button')
  chip.type = 'button'
  chip.className = isCompact ? 'agenda-chip agenda-chip--compact' : 'agenda-chip'
  chip.dataset.kind = item.kind
  chip.toggleAttribute('data-done', item.done)
  chip.title = `${kindName(item.kind)}: ${item.title}${item.time ? ` a las ${item.time}` : ''}`

  if (!isCompact) {
    const kind = document.createElement('span')
    kind.className = 'agenda-chip-kind'
    kind.textContent = item.time ? `${kindName(item.kind)} · ${item.time}` : kindName(item.kind)
    chip.append(kind)
  }
  const title = document.createElement('span')
  title.className = 'agenda-chip-title'
  title.textContent = isCompact && item.time ? `${item.time} ${item.title}` : item.title
  chip.append(title)

  chip.addEventListener('click', (event) => {
    event.stopPropagation()
    openAgendaDialog(item, item.date)
  })
  return chip
}

function createAddButton(date: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'calendar-add'
  button.textContent = '+'
  button.setAttribute('aria-label', `Agregar el ${longFormat.format(fromDateText(date))}`)
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    openAgendaDialog(null, date)
  })
  return button
}

function groupByDate(items: AgendaItem[]) {
  const byDate = new Map<string, AgendaItem[]>()
  for (const item of items) {
    byDate.set(item.date, [...(byDate.get(item.date) ?? []), item])
  }
  return byDate
}

function renderWeek(from: string, items: AgendaItem[]) {
  const byDate = groupByDate(items)
  const today = todayText()
  grid.className = 'calendar-grid calendar-grid--week'

  grid.replaceChildren(
    ...Array.from({ length: 7 }, (_, index) => {
      const date = addDays(from, index)
      const day = document.createElement('div')
      day.className = 'calendar-day'
      day.toggleAttribute('data-today', date === today)
      day.toggleAttribute('data-past', date < today)

      const head = document.createElement('div')
      head.className = 'calendar-day-head'
      const weekday = document.createElement('span')
      weekday.textContent = weekdayFormat.format(fromDateText(date)).replace('.', '')
      const number = document.createElement('strong')
      number.textContent = String(fromDateText(date).getDate())
      head.append(weekday, number)

      const list = document.createElement('div')
      list.className = 'calendar-day-items'
      list.append(...(byDate.get(date) ?? []).map((item) => createChip(item, false)))

      day.append(head, list, createAddButton(date))
      return day
    }),
  )
}

// El año: los doce meses en pequeño. Un día con algo lleva una marca del color de lo primero que tiene.
// Al apretar un día se abre su semana; al apretar el nombre del mes, ese mes.
function renderYear(items: AgendaItem[]) {
  const byDate = groupByDate(items)
  const today = todayText()
  const year = anchor.slice(0, 4)
  grid.className = 'calendar-grid calendar-grid--year'

  grid.replaceChildren(
    ...Array.from({ length: 12 }, (_, monthIndex) => {
      const first = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`
      const month = document.createElement('div')
      month.className = 'calendar-mini'

      const name = document.createElement('button')
      name.type = 'button'
      name.className = 'calendar-mini-name'
      name.textContent = capitalize(monthNameFormat.format(fromDateText(first)))
      name.addEventListener('click', () => {
        anchor = first
        setView('month')
      })

      const days = document.createElement('div')
      days.className = 'calendar-mini-days'
      const from = startOfWeek(first)
      for (let index = 0; index < 7; index++) {
        const weekday = document.createElement('span')
        weekday.className = 'calendar-mini-weekday'
        weekday.textContent = weekdayFormat.format(fromDateText(addDays(from, index))).charAt(0)
        days.append(weekday)
      }

      const last = addDays(addMonths(first, 1), -1)
      for (let date = from; date <= last; date = addDays(date, 1)) {
        if (date < first) {
          days.append(document.createElement('span'))
          continue
        }
        const dayItems = byDate.get(date) ?? []
        const day = document.createElement('button')
        day.type = 'button'
        day.className = 'calendar-mini-day'
        day.textContent = String(fromDateText(date).getDate())
        day.toggleAttribute('data-today', date === today)
        if (dayItems.length > 0) {
          day.dataset.kind = dayItems[0].kind
          day.title = dayItems.map((item) => `${kindName(item.kind)}: ${item.title}`).join('\n')
        }
        day.addEventListener('click', () => {
          anchor = date
          setView('week')
        })
        days.append(day)
      }

      month.append(name, days)
      return month
    }),
  )
}

function renderMonth(from: string, to: string, items: AgendaItem[]) {
  const byDate = groupByDate(items)
  const today = todayText()
  const month = anchor.slice(0, 7)
  grid.className = 'calendar-grid calendar-grid--month'

  const headers = Array.from({ length: 7 }, (_, index) => {
    const header = document.createElement('span')
    header.className = 'calendar-weekday'
    header.textContent = weekdayFormat.format(fromDateText(addDays(from, index))).replace('.', '')
    return header
  })

  const cells = Array.from({ length: daysFrom(from, to) + 1 }, (_, index) => {
    const date = addDays(from, index)
    const dayItems = byDate.get(date) ?? []
    const cell = document.createElement('div')
    cell.className = 'calendar-cell'
    cell.toggleAttribute('data-today', date === today)
    cell.toggleAttribute('data-other-month', !date.startsWith(month))

    const number = document.createElement('span')
    number.className = 'calendar-cell-number'
    number.textContent = String(fromDateText(date).getDate())
    cell.append(number)

    cell.append(...dayItems.slice(0, MONTH_CELL_ITEMS).map((item) => createChip(item, true)))
    if (dayItems.length > MONTH_CELL_ITEMS) {
      // Lo que no cabe se ve en esa semana
      const more = document.createElement('button')
      more.type = 'button'
      more.className = 'calendar-more'
      more.textContent = `y ${dayItems.length - MONTH_CELL_ITEMS} más`
      more.addEventListener('click', (event) => {
        event.stopPropagation()
        anchor = date
        setView('week')
      })
      cell.append(more)
    }
    cell.append(createAddButton(date))
    return cell
  })

  grid.replaceChildren(...headers, ...cells)
}

export async function refreshCalendar() {
  for (const button of viewButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.calendarView === view))
  }
  const { from, to } = visibleRange()
  label.textContent = describeRange(from, to)
  errorText.textContent = ''

  const current = ++request
  const range = await loadRange(from, to)
  if (current !== request) return
  if (!range.value) {
    errorText.textContent = range.error
    return
  }
  if (view === 'week') {
    renderWeek(from, range.value)
  } else if (view === 'month') {
    renderMonth(from, to, range.value)
  } else {
    renderYear(range.value)
  }
}

function setView(nextView: View) {
  view = nextView
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Sin almacenamiento, el calendario vuelve a la semana al recargar
  }
  refreshCalendar()
}

function move(direction: 1 | -1) {
  if (view === 'week') {
    anchor = addDays(anchor, 7 * direction)
  } else {
    anchor = addMonths(anchor, view === 'month' ? direction : 12 * direction)
  }
  refreshCalendar()
}

export function setUpCalendar() {
  document.querySelector('#calendar-prev')!.addEventListener('click', () => move(-1))
  document.querySelector('#calendar-next')!.addEventListener('click', () => move(1))
  document.querySelector('#calendar-today')!.addEventListener('click', () => {
    anchor = todayText()
    refreshCalendar()
  })
  document.querySelector('#agenda-add')!.addEventListener('click', () => {
    // En otra semana, lo nuevo parte en el primer día que se está mirando; en esta, hoy
    const { from, to } = visibleRange()
    const today = todayText()
    openAgendaDialog(null, today >= from && today <= to ? today : view === 'month' ? startOfMonth(anchor) : from)
  })
  for (const button of viewButtons) {
    button.addEventListener('click', () => setView(button.dataset.calendarView as View))
  }
}
