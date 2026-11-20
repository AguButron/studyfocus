// Un botón de 3 puntos que abre su menú debajo, alineado a su derecha. Se cierra con un clic afuera, Esc
// o al elegir una opción.
export function setUpMoreMenu(button: HTMLButtonElement, menu: HTMLElement) {
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    if (menu.matches(':popover-open')) {
      menu.hidePopover()
      return
    }
    menu.showPopover()
    const rect = button.getBoundingClientRect()
    menu.style.top = `${rect.bottom + 4}px`
    menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth)}px`
  })
  menu.addEventListener('toggle', (event) => {
    button.setAttribute('aria-expanded', String((event as ToggleEvent).newState === 'open'))
  })
  menu.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('[role="menuitem"]')) menu.hidePopover()
  })
}

const confirmDialog = document.querySelector<HTMLDialogElement>('#confirm-dialog')!
const confirmTitle = document.querySelector<HTMLHeadingElement>('#confirm-title')!
const confirmDetail = document.querySelector<HTMLParagraphElement>('#confirm-detail')!
const confirmYes = document.querySelector<HTMLButtonElement>('#confirm-yes')!
let answer: (yes: boolean) => void = () => {}
confirmYes.addEventListener('click', () => confirmDialog.close('yes'))
document.querySelector('#confirm-no')!.addEventListener('click', () => confirmDialog.close())
confirmDialog.addEventListener('close', () => answer(confirmDialog.returnValue === 'yes'))

// Pregunta antes de algo que no se deshace. Responde si se confirmó (Esc o Cancelar: no)
export function askConfirm(title: string, action: string, detail = ''): Promise<boolean> {
  confirmTitle.textContent = title
  confirmDetail.textContent = detail
  confirmDetail.hidden = !detail
  confirmYes.textContent = action
  confirmDialog.returnValue = ''
  confirmDialog.showModal()
  return new Promise((resolve) => (answer = resolve))
}
