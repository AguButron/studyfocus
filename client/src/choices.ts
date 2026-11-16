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

// Las variantes de cada actividad: cuál computador, cuaderno o libro tiene sobre la mesa (voxel/studyItems.ts
// las dibuja en el mismo orden). Se recuerda una por actividad
export const ACTIVITY_ITEMS: Record<ActivityKind, string[]> = {
  computer: ['Portátil gris', 'Portátil plateado', 'Portátil con stickers', 'Computador de escritorio'],
  reading: ['Libro de estudio', 'Novela de bolsillo', 'Atlas ilustrado'],
  writing: ['Cuaderno universitario', 'Libreta cuadriculada', 'Hojas y destacador'],
}
const ITEMS_KEY = 'studyfocus.activityItems'

function loadItems(): Record<ActivityKind, number> {
  const items = { computer: 0, reading: 0, writing: 0 }
  try {
    const saved = JSON.parse(localStorage.getItem(ITEMS_KEY) ?? '{}') as Record<string, unknown>
    for (const kind of Object.keys(items) as ActivityKind[]) {
      const value = saved[kind]
      if (Number.isInteger(value) && (value as number) >= 0 && (value as number) < ACTIVITY_ITEMS[kind].length) items[kind] = value as number
    }
  } catch {
    // Guardado de otra forma: se parte con la primera de cada una
  }
  return items
}

let items = loadItems()

export function getActivityItem(kind: ActivityKind) {
  return items[kind]
}

export function setActivityItem(kind: ActivityKind, index: number) {
  items = { ...items, [kind]: index }
  save(ITEMS_KEY, JSON.stringify(items))
  for (const listener of activityListeners) listener(activity)
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

// El diseño en cubos elegido para cada tipo de sala (voxel/designs.ts): con él se crean las salas y se arma
// el estudio individual. Se elige en Estudiar o en la galería (salas.html)
const DESIGNS_KEY = 'studyfocus.roomDesigns' // { [tipo]: id del diseño }

function loadChosenDesigns(): Record<string, string> {
  try {
    const saved = JSON.parse(localStorage.getItem(DESIGNS_KEY) ?? '{}')
    return saved && typeof saved === 'object' ? saved : {}
  } catch {
    return {}
  }
}

export function getChosenDesign(kind: string): string | null {
  const id = loadChosenDesigns()[kind]
  return typeof id === 'string' ? id : null
}

// Responde si se pudo guardar
export function chooseDesign(kind: string, id: string) {
  try {
    localStorage.setItem(DESIGNS_KEY, JSON.stringify({ ...loadChosenDesigns(), [kind]: id }))
    return true
  } catch {
    return false
  }
}
