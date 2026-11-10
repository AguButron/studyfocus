import * as THREE from 'three'

export const scene = new THREE.Scene()
scene.background = new THREE.Color(0x121417) // el fondo "paper" del tema Grafito

export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)

// Hasta 1,5 píxeles por punto: en pantallas de alta densidad la sala de bloques se ve igual de bien,
// y la memoria de video baja casi a la mitad
const MAX_PIXEL_RATIO = 1.5

// El lienzo se crea al entrar a la sala y se libera al salir: el menú no usa memoria de video
let renderer: THREE.WebGLRenderer | null = null

export function getRenderer() {
  return renderer
}

function fitToWindow() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer?.setSize(window.innerWidth, window.innerHeight)
}

export function startRenderer() {
  if (renderer) return renderer
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
  document.querySelector('#app')!.append(renderer.domElement)
  fitToWindow()
  return renderer
}

export function stopRenderer() {
  if (!renderer) return
  renderer.dispose()
  renderer.forceContextLoss()
  renderer.domElement.remove()
  renderer = null
}

window.addEventListener('resize', fitToWindow)
// Al salir de la pantalla completa (por ejemplo, la del video de YouTube) la ventana recupera su tamaño
// un poco después del aviso: se ajusta de nuevo en los cuadros siguientes
document.addEventListener('fullscreenchange', () => {
  requestAnimationFrame(() => {
    fitToWindow()
    requestAnimationFrame(fitToWindow)
  })
})

scene.add(new THREE.AmbientLight(0xffffff, 0.6))

const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(3, 5, 4)
scene.add(sun)
