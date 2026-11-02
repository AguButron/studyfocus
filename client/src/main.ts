import * as THREE from 'three'
import './style.css'

const WIDTH = 800
const HEIGHT = 600
const ROTATION_SPEED = 1 // radianes por segundo

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x2a2a3c)

const camera = new THREE.PerspectiveCamera(60, WIDTH / HEIGHT, 0.1, 100)
camera.position.set(0, 2, 5)
camera.lookAt(0, 0, 0)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(WIDTH, HEIGHT)
document.querySelector('#app')!.append(renderer.domElement)

scene.add(new THREE.AmbientLight(0xffffff, 0.6))

const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(3, 5, 4)
scene.add(sun)

const geometry = new THREE.BoxGeometry(1, 1, 1)
const material = new THREE.MeshStandardMaterial({ color: 0x89b4fa })
const cube = new THREE.Mesh(geometry, material)
scene.add(cube)

let lastTime = performance.now()

function loop(now: number) {
  const delta = now - lastTime
  lastTime = now

  cube.rotation.y += ROTATION_SPEED * (delta / 1000)

  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}

requestAnimationFrame(loop)