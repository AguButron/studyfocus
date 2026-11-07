// La música de StudyFocus: un lofi tranquilo que se arma en el navegador, sin archivos ni derechos de autor.
// Acordes suaves, un bajo, una melodía que aparece de a poco, un bombo apagado y el ruido de un disco.

const BEAT = 60 / 72 // segundos por pulso, a 72 por minuto
const BAR = 4 * BEAT
const LOOKAHEAD = 2.5 // segundos que se programan por adelantado: con la pestaña oculta, el reloj avanza a saltos
const SCHEDULE_INTERVAL = 500 // milisegundos
const FADE = 0.4 // segundos para subir o bajar el volumen
const MAX_GAIN = 0.5
const TONE = 1800 // Hz: el filtro que le quita brillo, como una grabación antigua

// Notas MIDI. Fmaj7 · Em7 · Dm7 · Cmaj7
const CHORDS = [
  [53, 57, 60, 64],
  [52, 55, 59, 62],
  [50, 53, 57, 60],
  [48, 52, 55, 59],
]
const MELODY = [72, 74, 76, 79, 81] // pentatónica de do, que suena bien sobre todos los acordes
const MELODY_CHANCE = 0.3

let context: AudioContext | null = null
let master: GainNode | null = null
let output: AudioNode | null = null
let noise: AudioBufferSourceNode | null = null
let schedulerTimer: number | null = null
let nextBarTime = 0
let barIndex = 0
let volume = 0.5

function frequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12)
}

function envelope(start: number, peak: number, attack: number, end: number) {
  const gain = context!.createGain()
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peak, start + attack)
  gain.gain.setTargetAtTime(0, end - attack, attack / 3)
  gain.connect(output!)
  return gain
}

function playTone(note: number, type: OscillatorType, start: number, duration: number, peak: number, attack: number) {
  const gain = envelope(start, peak, attack, start + duration)
  for (const detune of type === 'sine' ? [0] : [-6, 6]) {
    const oscillator = context!.createOscillator()
    oscillator.type = type
    oscillator.frequency.value = frequency(note)
    oscillator.detune.value = detune
    oscillator.connect(gain)
    oscillator.start(start)
    oscillator.stop(start + duration + attack)
  }
}

function playKick(start: number) {
  const gain = context!.createGain()
  gain.gain.setValueAtTime(0.5, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35)
  gain.connect(output!)

  const oscillator = context!.createOscillator()
  oscillator.frequency.setValueAtTime(110, start)
  oscillator.frequency.exponentialRampToValueAtTime(45, start + 0.3)
  oscillator.connect(gain)
  oscillator.start(start)
  oscillator.stop(start + 0.4)
}

function scheduleBar(start: number) {
  const chord = CHORDS[barIndex % CHORDS.length]

  for (const note of chord) {
    playTone(note, 'triangle', start, BAR, 0.035, 0.5)
  }
  playTone(chord[0] - 12, 'sine', start, BAR * 0.9, 0.12, 0.05)

  playKick(start)
  playKick(start + 2.5 * BEAT)

  for (let beat = 0; beat < 8; beat++) {
    if (Math.random() < MELODY_CHANCE) {
      const note = MELODY[Math.floor(Math.random() * MELODY.length)]
      playTone(note, 'sine', start + (beat * BEAT) / 2, BEAT * 1.5, 0.05, 0.02)
    }
  }
  barIndex++
}

function schedule() {
  while (nextBarTime < context!.currentTime + LOOKAHEAD) {
    scheduleBar(nextBarTime)
    nextBarTime += BAR
  }
}

// El ruido de fondo de un disco: un soplido suave con chasquidos sueltos
function createVinylNoise() {
  const length = context!.sampleRate * 4
  const buffer = context!.createBuffer(1, length, context!.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    const crackle = Math.random() < 0.0004 ? (Math.random() - 0.5) * 0.8 : 0
    data[i] = (Math.random() - 0.5) * 0.03 + crackle
  }

  const source = context!.createBufferSource()
  source.buffer = buffer
  source.loop = true
  source.connect(output!)
  source.start()
  return source
}

function createContext() {
  context = new AudioContext()
  master = context.createGain()
  master.gain.value = 0
  master.connect(context.destination)

  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = TONE
  filter.connect(master)
  output = filter
}

function targetGain() {
  return volume * volume * MAX_GAIN // el oído percibe el volumen de forma curva
}

export function isLofiPlaying() {
  return schedulerTimer !== null
}

export function setLofiVolume(value: number) {
  volume = value
  if (context && master && isLofiPlaying()) {
    master.gain.setTargetAtTime(targetGain(), context.currentTime, 0.05)
  }
}

// El navegador solo deja sonar después de un clic o una tecla: si aún no hubo, empieza con el primero
export function startLofi() {
  if (isLofiPlaying()) return
  if (!context) createContext()

  void context!.resume()
  noise ??= createVinylNoise()
  nextBarTime = context!.currentTime + 0.1
  schedule()
  schedulerTimer = window.setInterval(schedule, SCHEDULE_INTERVAL)
  master!.gain.cancelScheduledValues(context!.currentTime)
  master!.gain.setTargetAtTime(targetGain(), context!.currentTime, FADE / 3)
}

export function stopLofi() {
  if (!isLofiPlaying()) return

  clearInterval(schedulerTimer!)
  schedulerTimer = null
  // Las notas ya programadas siguen, pero en silencio
  master!.gain.cancelScheduledValues(context!.currentTime)
  master!.gain.setTargetAtTime(0, context!.currentTime, FADE / 3)
}

function resumeAfterGesture() {
  if (isLofiPlaying() && context?.state === 'suspended') {
    void context.resume()
  }
}

window.addEventListener('pointerdown', resumeAfterGesture)
window.addEventListener('keydown', resumeAfterGesture)
