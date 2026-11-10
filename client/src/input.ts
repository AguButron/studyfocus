const pressedKeys = new Set<string>()

function isTextField(target: EventTarget | null) {
  return (target instanceof HTMLInputElement && target.type !== 'range') || target instanceof HTMLTextAreaElement
}

// Escribir en un campo, como el link de la música o el chat, no mueve al personaje
window.addEventListener('keydown', (event) => {
  if (!isTextField(event.target)) pressedKeys.add(event.code)
})
window.addEventListener('keyup', (event) => pressedKeys.delete(event.code))
window.addEventListener('blur', () => pressedKeys.clear())

export function isPressed(...codes: string[]) {
  return codes.some((code) => pressedKeys.has(code))
}

export function onKeyPress(code: string, action: () => void) {
  window.addEventListener('keydown', (event) => {
    if (isTextField(event.target)) return
    if (event.code === code && !event.repeat) {
      action()
    }
  })
}
