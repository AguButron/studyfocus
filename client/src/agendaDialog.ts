// La ventana para agregar o editar algo de la agenda, con su apartado y, si tiene, su porcentaje y su nota
import {
  canBeDone,
  createItem,
  DEFAULT_REMIND_DAYS,
  deleteItem,
  restoreItem,
  KINDS,
  setItemDone,
  updateItem,
  type AgendaDraft,
  type AgendaItem,
  type AgendaKind,
} from './agenda'
import { showUndo, setUpUndoToast } from './undoToast'
import { describeKind, findSection, gradeFromPoints, getSpaces, loadSpaces, roundGrade } from './spaces'

const CONFIRM_TIME = 4000 // milisegundos que espera la confirmación de borrar

const dialog = document.querySelector<HTMLDialogElement>('#agenda-dialog')!
const form = document.querySelector<HTMLFormElement>('#agenda-form')!
const titleText = document.querySelector<HTMLHeadingElement>('#agenda-dialog-title')!
const kindSelect = document.querySelector<HTMLSelectElement>('#agenda-kind')!
const sectionSelect = document.querySelector<HTMLSelectElement>('#agenda-section')!
const sectionName = document.querySelector<HTMLParagraphElement>('#agenda-section-name')!
const gradingFields = document.querySelector<HTMLDivElement>('#agenda-grading')!
const weightInput = document.querySelector<HTMLInputElement>('#agenda-weight')!
const gradeInput = document.querySelector<HTMLInputElement>('#agenda-grade')!
const gradeHint = document.querySelector<HTMLSpanElement>('#agenda-grade-hint')!
const pointsInput = document.querySelector<HTMLInputElement>('#agenda-points')!
const totalInput = document.querySelector<HTMLInputElement>('#agenda-total')!
const pointsBox = document.querySelector<HTMLDetailsElement>('#agenda-points-box')!
const titleInput = document.querySelector<HTMLInputElement>('#agenda-title')!
const dateInput = document.querySelector<HTMLInputElement>('#agenda-date')!
const timeInput = document.querySelector<HTMLInputElement>('#agenda-time')!
const remindSelect = document.querySelector<HTMLSelectElement>('#agenda-remind')!
const notesInput = document.querySelector<HTMLTextAreaElement>('#agenda-notes')!
const errorText = document.querySelector<HTMLParagraphElement>('#agenda-error')!
const doneButton = document.querySelector<HTMLButtonElement>('#agenda-done')!
const deleteButton = document.querySelector<HTMLButtonElement>('#agenda-delete')!
const saveButton = document.querySelector<HTMLButtonElement>('#agenda-save')!

let editing: AgendaItem | null = null
let kind: AgendaKind = 'tarea'
let isRemindTouched = false // si la persona eligió el aviso, cambiar el tipo ya no lo cambia
let confirmTimer = 0
const listeners: (() => void)[] = []

// Inicio, el calendario y el detalle de un apartado se actualizan cuando algo cambia
export function onAgendaChange(listener: () => void) {
  listeners.push(listener)
}

export function notifyAgendaChange() {
  notifyChange()
}

function notifyChange() {
  for (const listener of listeners) listener()
}

function showKind() {
  kindSelect.value = kind
}

function chooseKind(nextKind: AgendaKind) {
  kind = nextKind
  if (!editing && !isRemindTouched) remindSelect.value = String(DEFAULT_REMIND_DAYS[kind])
  showKind()
}

// Los apartados de los espacios activos, agrupados por espacio. Uno archivado aparece solo si ya estaba elegido.
function fillSections(selectedId: string | null) {
  const groups = getSpaces()
    .filter((space) => !space.archived || space.sections.some((section) => section.id === selectedId))
    .filter((space) => space.sections.length > 0)
    .map((space) => {
      const group = document.createElement('optgroup')
      group.label = `${space.name} · ${describeKind(space.kind).sections}`
      group.append(...space.sections.map((section) => new Option(section.code ? `${section.name} (${section.code})` : section.name, section.id)))
      return group
    })
  sectionSelect.replaceChildren(new Option('Sin apartado', ''), ...groups)
  sectionSelect.value = selectedId ?? ''

  // Solo se muestra de qué ramo es, sin poder cambiarlo
  const found = findSection(sectionSelect.value || null)
  sectionName.hidden = !found
  if (found) {
    const label = describeKind(found.space.kind).section
    sectionName.textContent = `${label}: ${found.section.name}${found.section.code ? ` (${found.section.code})` : ''}`
    sectionName.style.setProperty('--section', found.section.color)
  }
}

function readNumber(input: HTMLInputElement) {
  return input.value.trim() === '' ? null : Number(input.value.replace(',', '.'))
}

// El porcentaje y la nota solo tienen sentido con un apartado, que dice la escala
function showGrading() {
  const found = findSection(sectionSelect.value || null)
  gradingFields.hidden = !found
  if (!found) return
  const { section } = found
  gradeInput.min = String(section.gradeMin)
  gradeInput.max = String(section.gradeMax)
  gradeInput.step = section.gradeMax - section.gradeMin <= 20 ? '0.1' : '1'
  gradeHint.textContent = `De ${section.gradeMin} a ${section.gradeMax}; se aprueba con ${section.gradePass}.`
}

function calculateFromPoints() {
  const found = findSection(sectionSelect.value || null)
  const points = readNumber(pointsInput)
  const total = readNumber(totalInput)
  if (!found || points === null || total === null || total <= 0 || points < 0 || points > total) {
    errorText.textContent = 'Escribe el puntaje obtenido y el total, con el obtenido menor o igual al total.'
    return
  }
  errorText.textContent = ''
  gradeInput.value = String(gradeFromPoints(found.section, points, total))
}

function resetDelete() {
  clearTimeout(confirmTimer)
  deleteButton.classList.remove('sf-btn--danger')
  deleteButton.textContent = 'Borrar'
}

function readDraft(): AgendaDraft {
  const found = findSection(sectionSelect.value || null)
  const grade = found ? readNumber(gradeInput) : null
  return {
    kind,
    title: titleInput.value,
    date: dateInput.value || null, // vacía cuando aún no se sabe
    time: timeInput.value || null,
    remindDays: remindSelect.value === '' ? null : Number(remindSelect.value),
    notes: notesInput.value,
    sectionId: found?.section.id ?? null,
    weight: found ? readNumber(weightInput) : null,
    grade: found && grade !== null ? roundGrade(found.section, grade) : null,
  }
}

async function finish(result: { error: string | null }) {
  if (result.error) {
    errorText.textContent = result.error
    return
  }
  dialog.close()
  notifyChange()
}

export function setUpAgendaDialog() {
  setUpUndoToast()
  kindSelect.replaceChildren(...KINDS.map(({ id, name }) => new Option(name, id)))
  kindSelect.addEventListener('change', () => chooseKind(kindSelect.value as AgendaKind))
  sectionSelect.addEventListener('change', showGrading)
  document.querySelector('#agenda-calculate')!.addEventListener('click', calculateFromPoints)

  remindSelect.addEventListener('change', () => (isRemindTouched = true))
  document.querySelector('#agenda-cancel')!.addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', resetDelete)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorText.textContent = ''
    saveButton.disabled = true
    const draft = readDraft()
    await finish(editing ? await updateItem(editing.id, draft) : await createItem(draft))
    saveButton.disabled = false
  })

  doneButton.addEventListener('click', async () => {
    if (editing) await finish(await setItemDone(editing.id, !editing.done))
  })

  // Borrar pide un segundo clic, para que no pase por accidente
  deleteButton.addEventListener('click', async () => {
    if (!editing) return
    if (!deleteButton.classList.contains('sf-btn--danger')) {
      deleteButton.classList.add('sf-btn--danger')
      deleteButton.textContent = '¿Borrar?'
      confirmTimer = window.setTimeout(resetDelete, CONFIRM_TIME)
      return
    }
    const deleted = editing
    const result = await deleteItem(deleted.id)
    await finish(result)
    if (!result.error) {
      showUndo(`Se borró «${deleted.title}».`, async () => {
        const restored = await restoreItem(deleted.id)
        if (!restored.error) notifyChange()
        return restored.error
      })
    }
  })
}

// Sin algo que editar, abre la ventana para agregar en ese día, y si se indica, en ese apartado
export async function openAgendaDialog(item: AgendaItem | null, date: string | null, sectionId: string | null = null) {
  editing = item
  isRemindTouched = false
  errorText.textContent = ''
  resetDelete()

  titleText.textContent = item ? 'Editar' : 'Agregar a tu agenda'
  kind = item?.kind ?? (sectionId ? 'prueba' : 'tarea')
  titleInput.value = item?.title ?? ''
  dateInput.value = (item ? item.date : date) ?? ''
  timeInput.value = item?.time ?? ''
  remindSelect.value = item ? (item.remindDays === null ? '' : String(item.remindDays)) : String(DEFAULT_REMIND_DAYS[kind])
  notesInput.value = item?.notes ?? ''
  weightInput.value = item?.weight !== null && item?.weight !== undefined ? String(item.weight) : ''
  gradeInput.value = item?.grade !== null && item?.grade !== undefined ? String(item.grade) : ''
  pointsInput.value = ''
  totalInput.value = ''
  pointsBox.open = false
  showKind()

  if (getSpaces().length === 0) await loadSpaces()
  fillSections(item?.sectionId ?? sectionId)
  showGrading()

  deleteButton.hidden = !item
  doneButton.hidden = !item || !canBeDone(item.kind)
  doneButton.textContent = item?.done ? 'Marcar como pendiente' : 'Marcar como hecha'

  if (!dialog.open) dialog.showModal()
  titleInput.focus()
}
