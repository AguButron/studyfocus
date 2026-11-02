import * as THREE from 'three'
import './style.css'

const WIDTH = 800
const HEIGHT = 600
const PLAYER_SPEED = 3 // metros por segundo

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x2a2a3c)

const camera = new THREE.PerspectiveCamera(60, WIDTH / HEIGHT, 0.1, 100)
camera.position.set(0, 10, 10)
camera.lookAt(0, 0, 0)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(WIDTH, HEIGHT)
document.querySelector('#app')!.append(renderer.domElement)

scene.add(new THREE.AmbientLight(0xffffff, 0.6))

const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(3, 5, 4)
scene.add(sun)

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 12),
  new THREE.MeshStandardMaterial({ color: 0x45475a }),
)
floor.rotation.x = -Math.PI / 2
scene.add(floor)

const WALL_COLOR = 0x585b70
const TABLE_COLOR = 0xa6744f
const PLAYER_HALF_SIZE = 0.5
const MAX_DELTA = 100 // milisegundos

interface Obstacle {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

const obstacles: Obstacle[] = []

function addBox(width: number, height: number, depth: number, x: number, z: number, color: number) {
  
  obstacles.push({
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  })
  
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color }),
  )
  box.position.set(x, height / 2, z)
  scene.add(box)
  return box
}

addBox(12, 2.5, 0.3, 0, -6, WALL_COLOR)
addBox(0.3, 2.5, 12, -6, 0, WALL_COLOR)
addBox(0.3, 2.5, 12, 6, 0, WALL_COLOR)
addBox(12, 0.3, 0.3, 0, 6, WALL_COLOR)

addBox(2.4, 0.75, 1.2, -3, -2.5,TABLE_COLOR)
addBox(2.4, 0.75, 1.2, 3, -2.5,TABLE_COLOR)
addBox(2.4, 0.75, 1.2, -3, 2.5,TABLE_COLOR)
addBox(2.4, 0.75, 1.2, 3, 2.5,TABLE_COLOR)

const player = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x89b4fa }),
)
player.position.y = 0.5
scene.add(player)


function collides(x: number, z: number) {
  return obstacles.some((obstacle) =>
    x + PLAYER_HALF_SIZE > obstacle.minX &&
    x - PLAYER_HALF_SIZE < obstacle.maxX &&
    z + PLAYER_HALF_SIZE > obstacle.minZ &&
    z - PLAYER_HALF_SIZE < obstacle.maxZ,
  )
}

const pressedKeys = new Set<string>()
window.addEventListener('keydown', (event) => pressedKeys.add(event.code))
window.addEventListener('keyup', (event) => pressedKeys.delete(event.code))
window.addEventListener('blur', () => pressedKeys.clear())

let lastTime = performance.now()

function loop(now: number) {
  const delta = Math.min(now - lastTime, MAX_DELTA)
  lastTime = now
  const distance = PLAYER_SPEED * (delta / 1000)

  let dx = 0
  let dz = 0

  // Movimiento

  if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) {
    dz -= 1
  }

  if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) {
    dx -= 1
  }

  if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) {
    dz += 1
  }

  if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) {
    dx += 1
  }

  const length = Math.hypot(dx, dz)

  if (length > 0) {
    const nextX = player.position.x + (dx / length) * distance
    if (!collides(nextX, player.position.z)) {
      player.position.x = nextX
    }

    const nextZ = player.position.z + (dz / length) * distance
    if (!collides(player.position.x, nextZ)) {
      player.position.z = nextZ
    }
  }
  

  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}

requestAnimationFrame(loop)