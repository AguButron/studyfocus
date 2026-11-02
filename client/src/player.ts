import * as THREE from 'three'
import { isPressed } from './input'
import { collides } from './room'
import { scene } from './scene'

const PLAYER_SPEED = 3 // metros por segundo
const PLAYER_HALF_SIZE = 0.5

const player = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x89b4fa }),
)
player.position.y = 0.5
scene.add(player)

export function updatePlayer(delta: number) {
  const distance = PLAYER_SPEED * (delta / 1000)

  let dx = 0
  let dz = 0

  if (isPressed('KeyW', 'ArrowUp')) dz -= 1
  if (isPressed('KeyA', 'ArrowLeft')) dx -= 1
  if (isPressed('KeyS', 'ArrowDown')) dz += 1
  if (isPressed('KeyD', 'ArrowRight')) dx += 1

  const length = Math.hypot(dx, dz)
  if (length === 0) return

  const nextX = player.position.x + (dx / length) * distance
  if (!collides(nextX, player.position.z, PLAYER_HALF_SIZE)) {
    player.position.x = nextX
  }

  const nextZ = player.position.z + (dz / length) * distance
  if (!collides(player.position.x, nextZ, PLAYER_HALF_SIZE)) {
    player.position.z = nextZ
  }
}