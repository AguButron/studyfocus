import * as THREE from 'three'
import type { Character } from './character'

// El personaje en 3D (Three.js): su modelo en la sala y el estudio donde se le saca la foto.
// Se carga aparte del menú: en la sala, o la primera vez que hace falta una foto que el navegador no tenía guardada.

const PHOTO_SIZE = 192 // píxeles: alcanza para la foto más grande, en pantallas de doble densidad
const STUDIO_IDLE_TIME = 2000 // milisegundos sin fotos para cerrar el estudio y liberar su memoria
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

// Un estudio fotográfico aparte de la sala, con la misma luz. Se arma al pedir una foto y se cierra al rato
let studio: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null
let closeTimer = 0

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

function closeStudio() {
  if (!studio) return
  studio.renderer.dispose()
  studio.renderer.forceContextLoss()
  studio = null
}

// La foto como dirección de imagen (PNG), para usarla en un <img>
export function renderCharacterPhoto(character: Character) {
  const { renderer, scene, camera } = getStudio()
  const model = createCharacterModel(character)
  scene.add(model)
  renderer.render(scene, camera)
  scene.remove(model)
  disposeCharacterModel(model)
  const photo = renderer.domElement.toDataURL('image/png')

  clearTimeout(closeTimer)
  closeTimer = window.setTimeout(closeStudio, STUDIO_IDLE_TIME)
  return photo
}
