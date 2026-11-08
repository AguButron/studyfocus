// La ventana para agregar o editar algo de la agenda
import {
  canBeDone,
  createItem,
  DEFAULT_REMIND_DAYS,
  deleteItem,
  KINDS,
  setItemDone,
  updateItem,
  type AgendaDraft,
  type AgendaItem,
  type AgendaKind,
} from './agenda'

const CONFIRM_TIME = 4000 // milisegundos que espera la confirmación de borrar

const dialog = document.querySelector<HTMLDialogElement>('#agenda-dialog')!
const form = document.querySelector<HTMLFormElement>('#agenda-form')!
const titleText = document.querySelector<HTMLHeadingElement>('#agenda-dialog-title')!
const kindSelect = document.querySelector<HTMLSelectElement>('#agenda-kind')!
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
let onChange: () => void = () => {}

function showKind() {
  kindSelect.value = kind
}

function chooseKind(nextKind: AgendaKind) {
  kind = nextKind
  if (!editing && !isRemindTouched) remindSelect.value = String(DEFAULT_REMIND_DAYS[kind])
  showKind()
}

function resetDelete() {
  clearTimeout(confirmTimer)
  deleteButton.classList.remove('sf-btn--danger')
  deleteButton.textContent = 'Borrar'
}

function readDraft(): AgendaDraft {
  return {
    kind,
    title: titleInput.value,
    date: dateInput.value,
    time: timeInput.value || null,
    remindDays: remindSelect.value === '' ? null : Number(remindSelect.value),
    notes: notesInput.value,
  }
}

async function finish(result: { error: string | null }) {
  if (result.error) {
    errorText.textContent = result.error
    return
  }
  dialog.close()
  onChange()
}

export function setUpAgendaDialog(changed: () => void) {
  onChange = changed

  kindSelect.replaceChildren(...KINDS.map(({ id, name }) => new Option(name, id)))
  kindSelect.addEventListener('change', () => chooseKind(kindSelect.value as AgendaKind))

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
    await finish(await deleteItem(editing.id))
  })
}

// Sin algo que editar, abre la ventana para agregar en ese día
export function openAgendaDialog(item: AgendaItem | null, date: string) {
  editing = item
  isRemindTouched = false
  errorText.textContent = ''
  resetDelete()

  titleText.textContent = item ? 'Editar' : 'Agregar a tu agenda'
  kind = item?.kind ?? 'tarea'
  titleInput.value = item?.title ?? ''
  dateInput.value = item?.date ?? date
  timeInput.value = item?.time ?? ''
  remindSelect.value = item ? (item.remindDays === null ? '' : String(item.remindDays)) : String(DEFAULT_REMIND_DAYS[kind])
  notesInput.value = item?.notes ?? ''
  showKind()

  deleteButton.hidden = !item
  doneButton.hidden = !item || !canBeDone(item.kind)
  doneButton.textContent = item?.done ? 'Marcar como pendiente' : 'Marcar como hecha'

  dialog.showModal()
  titleInput.focus()
}
