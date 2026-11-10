// Lo que cada persona elige para estudiar y se recuerda en el navegador: qué está haciendo (computador,
// leyendo, escribiendo) y con qué cámara mira la sala. Sin Three.js: lo usa el panel del temporizador, que
// también está al estudiar solo, sin sala 3D.

export type ActivityKind = 'computer' | 'reading' | 'writing'
export type CameraKind = 'desk' | 'table' | 'room'

const ACTIVITY_KEY = 'studyfocus.activity'
const CAMERA_KEY = 'studyfocus.camera'
const CAMERAS: CameraKind[] = ['desk', 'table', 'room']

export function isActivityKind(value: unknown): value is ActivityKind {
  return value === 'computer' || value === 'reading' || value === 'writing'
}

function load<T>(key: string, isValid: (value: unknown) => value is T, fallback: T): T {
  try {
    const saved = localStorage.getItem(key)
    return isValid(saved) ? saved : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Sin almacenamiento, la elección solo dura hasta recargar
  }
}

let activity = load(ACTIVITY_KEY, isActivityKind, 'computer')
const activityListeners: ((activity: ActivityKind) => void)[] = []

export function getActivity() {
  return activity
}

export function setActivity(next: ActivityKind) {
  activity = next
  save(ACTIVITY_KEY, next)
  for (const listener of activityListeners) listener(next)
}

// La sala 3D cambia lo que hay sobre la mesa
export function onActivityChange(listener: (activity: ActivityKind) => void) {
  activityListeners.push(listener)
}

const isCameraKind = (value: unknown): value is CameraKind => CAMERAS.includes(value as CameraKind)
let chosenCamera = load(CAMERA_KEY, isCameraKind, 'desk')

export function getChosenCamera() {
  return chosenCamera
}

export function chooseCamera(kind: CameraKind) {
  chosenCamera = kind
  save(CAMERA_KEY, kind)
}

// Escritorio → Mesa → Sala → Escritorio
export function chooseNextCamera() {
  chooseCamera(CAMERAS[(CAMERAS.indexOf(chosenCamera) + 1) % CAMERAS.length])
}
