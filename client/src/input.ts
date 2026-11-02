const pressedKeys = new Set<string>()

window.addEventListener('keydown', (event) => pressedKeys.add(event.code))
window.addEventListener('keyup', (event) => pressedKeys.delete(event.code))
window.addEventListener('blur', () => pressedKeys.clear())

export function isPressed(...codes: string[]) {
  return codes.some((code) => pressedKeys.has(code))
}

export function onKeyPress(code: string, action: () => void) {
  window.addEventListener('keydown', (event) => {
    if (event.code === code && !event.repeat) {
      action()
    }
  })
}