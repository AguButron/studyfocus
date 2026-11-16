// La ventana corta de un evento del calendario o de "Próximos 7 días": su nombre, su ramo y su hora.
// El lápiz lleva al ramo, donde se edita (también el porcentaje y la nota).
import { kindName, type AgendaItem } from './agenda'
import { openAgendaDialog } from './agendaDialog'
import { describeItemSection } from './spaces'
import { editInSection } from './spacesPanel'

const dialog = document.querySelector<HTMLDialogElement>('#agenda-detail')!
const kindText = document.querySelector<HTMLParagraphElement>('#agenda-detail-kind')!
const titleText = document.querySelector<HTMLHeadingElement>('#agenda-detail-title')!
const sectionText = document.querySelector<HTMLParagraphElement>('#agenda-detail-section')!
const timeText = document.querySelector<HTMLParagraphElement>('#agenda-detail-time')!
const editButton = document.querySelector<HTMLButtonElement>('#agenda-detail-edit')!

let current: AgendaItem | null = null

export function openAgendaDetail(item: AgendaItem) {
  current = item
  const section = describeItemSection(item.sectionId)
  kindText.textContent = kindName(item.kind)
  titleText.textContent = item.title
  sectionText.hidden = !section
  sectionText.textContent = section?.name ?? ''
  sectionText.style.setProperty('--section', section?.color ?? 'transparent')
  timeText.hidden = !item.time
  timeText.textContent = item.time ? `Hora: ${item.time}` : ''
  editButton.title = section ? 'Editar en su ramo' : 'Editar'
  editButton.setAttribute('aria-label', editButton.title)
  dialog.showModal()
}

export function setUpAgendaDetail() {
  document.querySelector('#agenda-detail-close')!.addEventListener('click', () => dialog.close())
  // Un clic en el fondo oscuro también cierra
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  editButton.addEventListener('click', () => {
    const item = current
    dialog.close()
    if (!item) return
    // Sin ramo no hay a dónde ir: se edita en la ventana de siempre
    if (item.sectionId) editInSection(item)
    else openAgendaDialog(item, item.date)
  })
}
