const pressedKeys = new Set<string>()

window.addEventListener('keydown', (event) => pressedKeys.add(event.code))
window.addEventListener('keyup', (event) => pressedKeys.delete(event.code))
window.addEventListener('blur', () => pressedKeys.clear())

export function isPressed(...codes: string[]) {
  return codes.some((code) => pressedKeys.has(code))
}