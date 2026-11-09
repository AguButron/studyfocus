// La ventana para poner un ramo en el horario: se elige el ramo, el tipo (clase, taller, ayudantía,
// laboratorio), cuántas veces a la semana, y el día y la hora de cada vez.
// Al apretar una clase del horario se abre la misma ventana para cambiar o borrar ese grupo de clases.
import { CLASS_KINDS, DAYS, MAX_CLASSES } from './classes'
import { updateClasses, type ClassBlock, type Section } from './spaces'

const CONFIRM_TIME = 4000 // milisegundos que espera la confirmación de borrar
// Los días que se proponen según cuántas veces a la semana: lunes y miércoles, luego viernes…
const SUGGESTED_DAYS = [1, 3, 5, 2, 4, 6, 7]

const dialog = document.querySelector<HTMLDialogElement>('#class-dialog')!
const form = document.querySelector<HTMLFormElement>('#class-form')!
const title = document.querySelector<HTMLHeadingElement>('#class-dialog-title')!
const sectionSelect = document.querySelector<HTMLSelectElement>('#class-section')!
const sectionHint = document.querySelector<HTMLSpanElement>('#class-section-hint')!
const kindSelect = document.querySelector<HTMLSelectElement>('#class-kind')!
const countInput = document.querySelector<HTMLInputElement>('#class-count')!
const timesList = document.querySelector<HTMLUListElement>('#class-times')!
const placeInput = document.querySelector<HTMLInputElement>('#class-place')!
const errorText = document.querySelector<HTMLParagraphElement>('#class-error')!
const deleteButton = document.querySelector<HTMLButtonElement>('#class-delete')!

type Time = { day: number; start: string; end: string }

let sections: Section[] = []
let editing: { section: Section; kind: string | null } | null = null // el grupo de clases que se cambia
let times: Time[] = []

function createTimeRow(time: Time, index: number) {
  const row = document.createElement('li')
  row.className = 'class-time'

  const day = document.createElement('select')
  day.className = 'sf-input'
  day.setAttribute('aria-label', `Día de la vez ${index + 1}`)
  day.append(...DAYS.map(({ id, name }) => new Option(name, String(id))))
  day.value = String(time.day)
  day.addEventListener('change', () => (time.day = Number(day.value)))

  const timeInput = (value: string, label: string, onInput: (value: string) => void) => {
    const input = document.createElement('input')
    input.className = 'sf-input'
    input.type = 'time'
    input.required = true
    input.value = value
    input.setAttribute('aria-label', label)
    input.title = label
    input.addEventListener('input', () => {
      onInput(input.value)
      checkOrder()
    })
    return input
  }
  // La hora de la primera vez se copia a las demás que tenían la misma (o estaban vacías): lo típico es la misma hora
  const copyToOthers = (key: 'start' | 'end', before: string, value: string) => {
    if (index !== 0) return
    times.forEach((other, position) => {
      if (position === 0 || other[key] !== before) return
      other[key] = value
      const input = timesList.children[position]?.querySelector<HTMLInputElement>(`input[aria-label="${key === 'start' ? 'Empieza' : 'Termina'}"]`)
      if (input) input.value = value
    })
  }
  const start = timeInput(time.start, 'Empieza', (value) => {
    copyToOthers('start', time.start, value)
    time.start = value
  })
  const end = timeInput(time.end, 'Termina', (value) => {
    copyToOthers('end', time.end, value)
    time.end = value
  })
  const checkOrder = () => end.setCustomValidity(time.start && time.end && time.start >= time.end ? 'Debe terminar después de empezar.' : '')
  checkOrder()

  const dash = document.createElement('span')
  dash.className = 'class-time-dash'
  dash.textContent = 'a'
  row.append(day, start, dash, end)
  return row
}

function renderTimes() {
  timesList.replaceChildren(...times.map(createTimeRow))
}

// Al cambiar cuántas veces a la semana se agregan o quitan días; los nuevos parten con la hora del primero
function resizeTimes(count: number) {
  const first = times[0] ?? { day: 1, start: '', end: '' }
  while (times.length < count) {
    const used = new Set(times.map((time) => time.day))
    const day = SUGGESTED_DAYS.find((option) => !used.has(option)) ?? 1
    times.push({ day, start: first.start, end: first.end })
  }
  times.length = count
  renderTimes()
}

function showSectionHint() {
  // Si el programa traía el horario en texto, se muestra como ayuda
  const section = sections.find((item) => item.id === sectionSelect.value)
  sectionHint.hidden = !section?.schedule
  sectionHint.textContent = section?.schedule ? `El programa dice: «${section.schedule}».` : ''
}

function resetDelete() {
  deleteButton.classList.remove('sf-btn--danger')
  deleteButton.textContent = 'Borrar'
}

// Las clases del ramo que no son el grupo que se está cambiando
function otherClasses(section: Section) {
  return editing && editing.section.id === section.id ? section.classes.filter((item) => item.kind !== editing!.kind) : section.classes
}

// Sin target, para agregar; con target, para cambiar las clases de ese tipo de ese ramo
export function openClassDialog(available: Section[], target: { section: Section; kind: string | null } | null = null) {
  sections = available
  editing = target
  errorText.textContent = ''
  resetDelete()
  title.textContent = target ? 'Cambiar del horario' : 'Agregar al horario'
  deleteButton.hidden = !target

  sectionSelect.replaceChildren(...sections.map((section) => new Option(section.code ? `${section.name} · ${section.code}` : section.name, section.id)))
  sectionSelect.value = target?.section.id ?? sections[0]?.id ?? ''
  sectionSelect.disabled = !!target
  showSectionHint()

  // Un tipo que no está en la lista (como "Cátedra", de antes) se agrega para no perderlo
  const kinds = target?.kind && !CLASS_KINDS.includes(target.kind) ? [...CLASS_KINDS, target.kind] : CLASS_KINDS
  kindSelect.replaceChildren(...kinds.map((kind) => new Option(kind, kind)))
  kindSelect.value = target?.kind ?? CLASS_KINDS[0]

  const group = target ? target.section.classes.filter((item) => item.kind === target.kind) : []
  times = group.map(({ day, start, end }) => ({ day, start, end }))
  placeInput.value = group[0]?.place ?? ''
  if (times.length === 0) resizeTimes(2)
  else renderTimes()
  countInput.value = String(times.length)

  dialog.showModal()
  ;(target ? kindSelect : sectionSelect).focus()
}

async function save() {
  const section = sections.find((item) => item.id === sectionSelect.value)
  if (!section) {
    errorText.textContent = 'Elige un ramo.'
    return
  }
  const place = placeInput.value.trim() || null
  const added: ClassBlock[] = times.map(({ day, start, end }) => ({ day, start, end, kind: kindSelect.value, place }))
  const classes = [...otherClasses(section), ...added]
  if (classes.length > MAX_CLASSES) {
    errorText.textContent = `Cada ramo tiene hasta ${MAX_CLASSES} clases por semana.`
    return
  }
  const error = await updateClasses(section.id, classes)
  if (error) errorText.textContent = error
  else dialog.close()
}

export function setUpClassDialog() {
  countInput.addEventListener('input', () => {
    const count = Number(countInput.value)
    if (Number.isInteger(count) && count >= 1 && count <= 7) resizeTimes(count)
  })
  sectionSelect.addEventListener('change', showSectionHint)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    save()
  })
  document.querySelector('#class-cancel')!.addEventListener('click', () => dialog.close())

  // Borrar pide un segundo clic
  let timer = 0
  deleteButton.addEventListener('click', async () => {
    if (!editing) return
    if (!deleteButton.classList.contains('sf-btn--danger')) {
      deleteButton.classList.add('sf-btn--danger')
      deleteButton.textContent = '¿Borrar del horario?'
      clearTimeout(timer)
      timer = window.setTimeout(resetDelete, CONFIRM_TIME)
      return
    }
    const error = await updateClasses(editing.section.id, otherClasses(editing.section))
    if (error) errorText.textContent = error
    else dialog.close()
  })
}
