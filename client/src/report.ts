// Reportar a alguien al equipo: desde su perfil (3 puntos) o desde su tarjeta en la sala
import { callApi } from './api'
import { showNotice } from './undoToast'

const dialog = document.querySelector<HTMLDialogElement>('#report-dialog')!
const form = document.querySelector<HTMLFormElement>('#report-form')!
const title = document.querySelector<HTMLHeadingElement>('#report-title')!
const details = document.querySelector<HTMLTextAreaElement>('#report-details')!
const errorText = document.querySelector<HTMLParagraphElement>('#report-error')!

let username = ''

export function openReport(person: { username: string; name: string }) {
  username = person.username
  title.textContent = `Reportar a ${person.name}`
  form.reset()
  errorText.textContent = ''
  dialog.showModal()
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const reason = new FormData(form).get('report-reason')
  const result = await callApi('/api/reportes', { username, reason, details: details.value })
  if (result.error) {
    errorText.textContent = result.error
    return
  }
  dialog.close()
  showNotice('Reporte enviado. Gracias.')
})
document.querySelector('#report-cancel')!.addEventListener('click', () => dialog.close())
