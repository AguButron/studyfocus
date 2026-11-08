// Un aviso abajo en la pantalla con un botón para deshacer, por ejemplo después de borrar algo.
// Desaparece solo después de unos segundos; uno nuevo reemplaza al anterior.

const VISIBLE_TIME = 10000 // milisegundos

const toast = document.querySelector<HTMLDivElement>('#undo-toast')!
const text = document.querySelector<HTMLSpanElement>('#undo-toast-text')!
const button = document.querySelector<HTMLButtonElement>('#undo-toast-button')!

let hideTimer = 0
let undo: (() => Promise<string | null>) | null = null

function hide() {
  clearTimeout(hideTimer)
  toast.hidden = true
  undo = null
}

// onUndo devuelve un error para mostrar, o null si salió bien
export function showUndo(message: string, onUndo: () => Promise<string | null>) {
  clearTimeout(hideTimer)
  undo = onUndo
  text.textContent = message
  button.hidden = false
  button.disabled = false
  toast.hidden = false
  hideTimer = window.setTimeout(hide, VISIBLE_TIME)
}

export function setUpUndoToast() {
  button.addEventListener('click', async () => {
    if (!undo) return
    const action = undo
    undo = null
    button.disabled = true
    clearTimeout(hideTimer)
    const error = await action()
    if (error) {
      text.textContent = error
      button.hidden = true
      hideTimer = window.setTimeout(hide, VISIBLE_TIME / 2)
    } else {
      hide()
    }
  })
  document.querySelector('#undo-toast-close')!.addEventListener('click', hide)
}
