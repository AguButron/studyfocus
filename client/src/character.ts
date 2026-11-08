import * as THREE from 'three'

// Cómo se ve el personaje de cada persona. Su foto es el mismo modelo visto de frente, así que nadie
// sube imágenes y todas las fotos combinan. Hoy el personaje es un cubo de color; el creador de
// personajes agregará más datos a esta misma ficha, y las fotos cambiarán solas.

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

const PHOTO_SIZE = 192 // píxeles: alcanza para la foto más grande, en pantallas de doble densidad
const geometry = new THREE.BoxGeometry(1, 1, 1)

export function createCharacterModel(character: Character) {
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: character.color }))
}

// Cambia el color sin crear el modelo de nuevo
export function paintCharacterModel(model: THREE.Mesh, character: Character) {
  ;(model.material as THREE.MeshStandardMaterial).color.set(character.color)
}

export function disposeCharacterModel(model: THREE.Mesh) {
  ;(model.material as THREE.Material).dispose()
}

// Un estudio fotográfico aparte de la sala, con la misma luz, que se arma la primera vez que se pide una foto
let studio: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null
const photos = new Map<string, string>()

function getStudio() {
  if (studio) return studio

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(PHOTO_SIZE, PHOTO_SIZE, false)

  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const sun = new THREE.DirectionalLight(0xffffff, 2)
  sun.position.set(3, 5, 4)
  scene.add(sun)

  // De frente y un poco desde arriba y al lado, para que se note que es un cubo
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
  camera.position.set(1.7, 1.5, 3.4)
  camera.lookAt(0, -0.05, 0)

  studio = { renderer, scene, camera }
  return studio
}

// La foto como dirección de imagen, para usarla en un <img>. Se guarda: cada personaje se fotografía una vez.
export function getCharacterPhoto(character: Character) {
  const key = JSON.stringify(character)
  const saved = photos.get(key)
  if (saved) return saved

  const { renderer, scene, camera } = getStudio()
  const model = createCharacterModel(character)
  scene.add(model)
  renderer.render(scene, camera)
  scene.remove(model)
  disposeCharacterModel(model)

  const photo = renderer.domElement.toDataURL('image/png')
  photos.set(key, photo)
  return photo
}

// Una foto lista para poner en la página; el nombre va en el texto de al lado, así que la imagen no lo repite
export function createCharacterPhoto(character: Character, className: string) {
  const image = document.createElement('img')
  image.className = `character-photo ${className}`
  image.alt = ''
  image.src = getCharacterPhoto(character)
  return image
}
