import type { Period } from './timer'

const VOLUME = 0.12
const NOTE_TIME = 0.22 // segundos
const FADE_TIME = 0.015 // segundos, para que la nota no parta con un chasquido
const SILENCE = 0.001 // el volumen no puede bajar a cero con una curva exponencial

// Frecuencias en Hz: baja al descansar y sube al volver a estudiar
const NOTES: Record<Period, number[]> = {
  break: [659, 440],
  study: [440, 659],
}

let context: AudioContext | null = null

// El navegador solo permite sonar después de que la persona interactúa con la página
function unlock() {
  context ??= new AudioContext()
  void context.resume()
}

window.addEventListener('pointerdown', unlock)
window.addEventListener('keydown', unlock)

export function playPeriodSound(period: Period) {
  // Sin esto, las notas quedarían en cola y sonarían juntas al primer clic
  if (context?.state !== 'running') return

  NOTES[period].forEach((frequency, index) => {
    const start = context!.currentTime + index * NOTE_TIME
    const end = start + NOTE_TIME

    const gain = context!.createGain()
    gain.gain.setValueAtTime(SILENCE, start)
    gain.gain.linearRampToValueAtTime(VOLUME, start + FADE_TIME)
    gain.gain.exponentialRampToValueAtTime(SILENCE, end)
    gain.connect(context!.destination)

    const oscillator = context!.createOscillator()
    oscillator.frequency.value = frequency
    oscillator.connect(gain)
    oscillator.start(start)
    oscillator.stop(end)
  })
}
