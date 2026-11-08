// La lista de Inicio: lo atrasado y lo que viene en los próximos 7 días, agrupado por día
import {
  addDays,
  canBeDone,
  daysFrom,
  fromDateText,
  kindName,
  loadRange,
  loadReminders,
  setItemDone,
  todayText,
  type AgendaItem,
} from './agenda'
import { openAgendaDialog } from './agendaDialog'
import { describeItemSection, ensureSpaces } from './spaces'

const DAYS = 7

const list = document.querySelector<HTMLDivElement>('#upcoming-list')!
const emptyText = document.querySelector<HTMLParagraphElement>('#upcoming-empty')!
const errorText = document.querySelector<HTMLParagraphElement>('#upcoming-error')!
const homeBadge = document.querySelector<HTMLSpanElement>('#home-badge')!

const dayFormat = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric' })

let request = 0 // descarta respuestas viejas
let onChange: () => void = () => {}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// "Hoy · domingo 8", "Mañana · lunes 9", "Martes 10"
function describeDay(date: string) {
  const days = daysFrom(todayText(), date)
  const name = dayFormat.format(fromDateText(date))
  if (days === 0) return `Hoy · ${name}`
  if (days === 1) return `Mañana · ${name}`
  return capitalize(name)
}

function createRow(item: AgendaItem, isLate: boolean) {
  const row = document.createElement('li')
  row.className = 'agenda-row'
  row.dataset.kind = item.kind
  row.toggleAttribute('data-done', item.done)
  const section = describeItemSection(item.sectionId)
  if (section) row.style.setProperty('--kind', section.color)
  row.toggleAttribute('data-late', isLate)

  if (canBeDone(item.kind)) {
    const check = document.createElement('input')
    check.type = 'checkbox'
    check.className = 'agenda-check'
    check.checked = item.done
    check.setAttribute('aria-label', item.done ? `Marcar "${item.title}" como pendiente` : `Marcar "${item.title}" como hecha`)
    check.addEventListener('change', async () => {
      check.disabled = true
      const { error } = await setItemDone(item.id, check.checked)
      if (error) {
        check.checked = !check.checked
        check.disabled = false
        errorText.textContent = error
        return
      }
      onChange()
    })
    row.append(check)
  } else {
    // Las pruebas no se marcan: un espacio del mismo ancho deja los títulos alineados
    const spacer = document.createElement('span')
    spacer.className = 'agenda-check-spacer'
    row.append(spacer)
  }

  const open = document.createElement('button')
  open.type = 'button'
  open.className = 'agenda-row-open'
  const title = document.createElement('strong')
  title.textContent = item.title
  const detail = document.createElement('span')
  detail.className = 'sf-row-detail'
  const late = isLate ? ` · atrasada, hace ${daysFrom(item.date, todayText())} días` : ''
  detail.textContent = `${[kindName(item.kind), section?.label, item.time].filter(Boolean).join(' · ')}${late}`
  open.append(title, detail)
  open.addEventListener('click', () => openAgendaDialog(item, item.date))
  row.append(open)
  return row
}

function createGroup(name: string, items: AgendaItem[], isLate: boolean) {
  const group = document.createElement('section')
  group.className = 'upcoming-group'
  const heading = document.createElement('h3')
  heading.className = 'sf-section-title'
  heading.textContent = name
  const rows = document.createElement('ul')
  rows.className = 'agenda-rows'
  rows.append(...items.map((item) => createRow(item, isLate)))
  group.append(heading, rows)
  return group
}

export function setUpUpcoming(changed: () => void) {
  onChange = changed
  document.querySelector('#upcoming-add')!.addEventListener('click', () => openAgendaDialog(null, todayText()))
}

export async function refreshUpcoming() {
  const today = todayText()
  const current = ++request
  const [range, reminders] = await Promise.all([
    loadRange(today, addDays(today, DAYS - 1)),
    loadReminders(today),
    ensureSpaces(),
  ])
  if (current !== request) return

  errorText.textContent = range.error ?? reminders.error ?? ''
  if (reminders.value) {
    homeBadge.hidden = reminders.value.length === 0
    homeBadge.textContent = String(reminders.value.length)
  }
  if (!range.value) return

  const late = reminders.value?.filter((item) => item.date < today) ?? []
  const groups: HTMLElement[] = []
  if (late.length > 0) groups.push(createGroup('Atrasadas', late, true))
  for (let index = 0; index < DAYS; index++) {
    const date = addDays(today, index)
    const items = range.value.filter((item) => item.date === date)
    if (items.length > 0) groups.push(createGroup(describeDay(date), items, false))
  }

  list.replaceChildren(...groups)
  emptyText.hidden = groups.length > 0
}
