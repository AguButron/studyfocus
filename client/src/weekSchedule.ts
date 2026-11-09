// El horario de la semana de una carpeta: una columna por día y cada clase de sus ramos en su hora,
// con el color del ramo. Si dos clases chocan (tope de horario), se ponen lado a lado y se marcan.
import { DAYS } from './classes'
import type { ClassBlock, Section } from './spaces'

const MIN_HOURS = 4 // el alto mínimo de la grilla, aunque haya una sola clase corta

interface Placed {
  section: Section
  item: ClassBlock
  start: number // minutos desde medianoche
  end: number
  lane: number
  lanes: number // cuántas clases chocan en ese rato
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

// Reparte las clases de un día en carriles: las que se topan quedan lado a lado
function placeDay(entries: Omit<Placed, 'lane' | 'lanes'>[]) {
  const sorted = [...entries].sort((a, b) => a.start - b.start || a.end - b.end)
  const placed: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = -1
  const closeCluster = () => {
    const lanes = Math.max(0, ...cluster.map((entry) => entry.lane)) + 1
    for (const entry of cluster) entry.lanes = lanes
    cluster = []
  }
  for (const entry of sorted) {
    if (entry.start >= clusterEnd) closeCluster()
    // El primer carril que ya se desocupó
    const busy = new Set(cluster.filter((other) => other.end > entry.start).map((other) => other.lane))
    let lane = 0
    while (busy.has(lane)) lane++
    const item = { ...entry, lane, lanes: 1 }
    cluster.push(item)
    placed.push(item)
    clusterEnd = Math.max(clusterEnd, entry.end)
  }
  closeCluster()
  return placed
}

const pad = (value: number) => String(value).padStart(2, '0')

// null si ningún ramo tiene clases. Al apretar una clase se llama a openClass con su ramo y la clase
export function createWeekSchedule(sections: Section[], openClass: (section: Section, item: ClassBlock) => void) {
  const entries = sections.flatMap((section) =>
    section.classes.map((item) => ({ section, item, start: toMinutes(item.start), end: toMinutes(item.end) })),
  )
  if (entries.length === 0) return null

  // De lunes a viernes siempre; sábado y domingo solo si hay clases
  const days = DAYS.filter((day) => day.id <= 5 || entries.some((entry) => entry.item.day === day.id))
  let first = Math.floor(Math.min(...entries.map((entry) => entry.start)) / 60)
  let last = Math.ceil(Math.max(...entries.map((entry) => entry.end)) / 60)
  if (last - first < MIN_HOURS) last = Math.min(24, first + MIN_HOURS)
  if (last - first < MIN_HOURS) first = last - MIN_HOURS
  const span = (last - first) * 60
  const top = (minutes: number) => `${((minutes - first * 60) / span) * 100}%`

  const now = new Date()
  const today = now.getDay() === 0 ? 7 : now.getDay()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const scroller = document.createElement('div')
  scroller.className = 'week-scroll'
  const grid = document.createElement('div')
  grid.className = 'week-grid'
  grid.style.setProperty('--days', String(days.length))
  grid.style.setProperty('--hours', String(last - first))

  // Encabezado: un espacio sobre las horas y el nombre de cada día
  grid.append(document.createElement('span'))
  for (const day of days) {
    const head = document.createElement('span')
    head.className = 'week-day-name'
    head.toggleAttribute('data-today', day.id === today)
    head.textContent = day.short
    head.title = day.name
    grid.append(head)
  }

  // Las horas a la izquierda
  const hours = document.createElement('div')
  hours.className = 'week-hours'
  hours.setAttribute('aria-hidden', 'true')
  for (let hour = first; hour < last; hour++) {
    const label = document.createElement('span')
    label.style.top = top(hour * 60)
    label.textContent = `${pad(hour)}:00`
    hours.append(label)
  }
  grid.append(hours)

  for (const day of days) {
    const column = document.createElement('div')
    column.className = 'week-day'
    column.toggleAttribute('data-today', day.id === today)
    column.setAttribute('role', 'list')
    column.setAttribute('aria-label', day.name)

    for (const entry of placeDay(entries.filter((other) => other.item.day === day.id))) {
      const { section, item } = entry
      const block = document.createElement('button')
      block.type = 'button'
      block.className = 'week-class'
      block.setAttribute('role', 'listitem')
      block.style.setProperty('--section', section.color)
      block.style.top = top(entry.start)
      block.style.height = `${((entry.end - entry.start) / span) * 100}%`
      block.style.left = `${(entry.lane / entry.lanes) * 100}%`
      block.style.width = `${100 / entry.lanes}%`
      block.toggleAttribute('data-clash', entry.lanes > 1)
      block.toggleAttribute('data-now', day.id === today && entry.start <= nowMinutes && nowMinutes < entry.end)

      const name = document.createElement('strong')
      name.textContent = section.code ?? section.name
      const time = document.createElement('span')
      time.textContent = `${item.start}–${item.end}`
      const detail = document.createElement('span')
      detail.textContent = [item.kind, item.place ?? section.place].filter(Boolean).join(' · ')
      block.append(name, time)
      if (detail.textContent) block.append(detail)
      block.title = [
        section.name,
        `${day.name} ${item.start}–${item.end}`,
        item.kind,
        item.place ?? section.place,
        entry.lanes > 1 ? 'Tope de horario con otra clase' : null,
        day.id === today && entry.start <= nowMinutes && nowMinutes < entry.end ? 'Ahora en clase' : null,
      ]
        .filter(Boolean)
        .join('\n')
      block.addEventListener('click', () => openClass(section, item))
      column.append(block)
    }

    // Una línea en la hora actual, en la columna de hoy
    if (day.id === today && nowMinutes > first * 60 && nowMinutes < last * 60) {
      const line = document.createElement('span')
      line.className = 'week-now'
      line.style.top = top(nowMinutes)
      line.setAttribute('aria-hidden', 'true')
      column.append(line)
    }
    grid.append(column)
  }

  scroller.append(grid)
  return scroller
}
