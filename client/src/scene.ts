import * as THREE from 'three'

export const scene = new THREE.Scene()
scene.background = new THREE.Color(0x121417) // el fondo "paper" del tema Grafito

export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)

export const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
document.querySelector('#app')!.append(renderer.domElement)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

scene.add(new THREE.AmbientLight(0xffffff, 0.6))

const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(3, 5, 4)
scene.add(sun)
