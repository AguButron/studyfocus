// Cómo se ve el personaje de cada persona. Su foto es el mismo modelo visto de frente, así que nadie
// sube imágenes y todas las fotos combinan. Hoy el personaje es un cubo de color; el creador de
// personajes agregará más datos a esta misma ficha, y las fotos cambiarán solas.
//
// Este archivo no usa Three.js, para que el menú no lo cargue: cada foto se saca una vez en un estudio 3D
// (characterModel.ts, que se carga aparte) y se guarda en el navegador. Mientras tanto se ve un cuadrado
// del color del personaje, y la foto aparece apenas está lista.

export interface Character {
  color: string // como '#89b4fa'
}

// Los mismos que acepta el servidor
export const CHARACTER_COLORS = [
  { color: '#89b4fa', name: 'Azul' },
  { color: '#f38ba8', name: 'Rosado' },
  { color: '#a6e3a1', name: 'Verde' },
  { color: '#f9e2af', name: 'Amarillo' },
  { color: '#fab387', name: 'Durazno' },
  { color: '#cba6f7', name: 'Lila' },
  { color: '#94e2d5', name: 'Turquesa' },
  { color: '#f5f5f5', name: 'Blanco' },
]

// Cambia la versión si cambia cómo se ve la foto, para volver a sacarlas
const STORAGE_KEY = 'studyfocus.photos.v1'
const MAX_SAVED = 40 // fotos guardadas en el navegador; cada una pesa unos 4 KB

const photos = new Map<string, string>(loadSaved())
const pending = new Set<string>()

function loadSaved(): [string, string][] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter((entry) => Array.isArray(entry) && entry.length === 2) : []
  } catch {
    return []
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...photos].slice(-MAX_SAVED)))
  } catch {
    // Sin almacenamiento se vuelven a sacar en la próxima visita
  }
}

const keyOf = (character: Character) => JSON.stringify(character)

// Mientras se saca la foto: un cuadrado redondeado del color del personaje
function placeholder(character: Character) {
  const color = /^#[0-9a-f]{3,8}$/i.test(character.color) ? character.color : '#cccccc'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="2" y="2" width="6" height="6" rx="1" fill="${color}"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// Saca la foto en el estudio 3D (que se carga recién aquí) y la pone en todas las imágenes que la esperan
async function takePhoto(character: Character, key: string) {
  if (pending.has(key)) return
  pending.add(key)
  try {
    const { renderCharacterPhoto } = await import('./characterModel')
    const photo = renderCharacterPhoto(character)
    photos.set(key, photo)
    save()
    for (const image of document.querySelectorAll<HTMLImageElement>('img[data-photo-key]')) {
      if (image.dataset.photoKey === key) image.src = photo
    }
  } catch (error) {
    console.error('No se pudo sacar la foto del personaje:', error)
  } finally {
    pending.delete(key)
  }
}

// La foto como dirección de imagen. Si aún no está, devuelve el cuadrado de color y la saca en segundo plano
export function getCharacterPhoto(character: Character) {
  const key = keyOf(character)
  const saved = photos.get(key)
  if (saved) return saved
  takePhoto(character, key)
  return placeholder(character)
}

// Pone la foto en una imagen que ya existe; se cambia sola cuando la foto esté lista
export function setCharacterPhoto(image: HTMLImageElement, character: Character) {
  image.dataset.photoKey = keyOf(character)
  const photo = getCharacterPhoto(character)
  if (image.getAttribute('src') !== photo) image.src = photo
}

// Una foto lista para poner en la página; el nombre va en el texto de al lado, así que la imagen no lo repite
export function createCharacterPhoto(character: Character, className: string) {
  const image = document.createElement('img')
  image.className = `character-photo ${className}`
  image.alt = ''
  setCharacterPhoto(image, character)
  return image
}
