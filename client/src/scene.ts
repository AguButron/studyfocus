import * as THREE from 'three'

export const scene = new THREE.Scene()
scene.background = new THREE.Color(0x121417) // el fondo "paper" del tema Grafito

export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)

export const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
document.querySelector('#app')!.append(renderer.domElement)

function fitToWindow() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
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
