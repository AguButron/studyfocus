import * as THREE from 'three'
import { isPressed } from './input'
import { scene } from './scene'
import { leaveSeat, onSeatLost, takeSeat, type ResumedPlayer } from './network'
import { isSeatTaken } from './remotePlayers'
import { collides, SEATED_Y, seats, STANDING_Y, type Seat } from './room'
import { isStudyRunning } from './timer'

const PLAYER_SPEED = 3 // metros por segundo
const PLAYER_HALF_SIZE = 0.5
const SPAWN_RANGE = 1 // metros alrededor del centro
const SIT_DISTANCE = 1.2 // metros
const STAND_UP_DISTANCE = 0.8 // metros, algo más que media silla y medio personaje

function randomSpawn() {
  return Math.random() * SPAWN_RANGE * 2 - SPAWN_RANGE
}

export const player = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x89b4fa }),
)
player.position.set(randomSpawn(), STANDING_Y, randomSpawn())
scene.add(player)

let currentSeat: Seat | null = null
let isRequestingSeat = false
let seatListener: (seat: Seat | null) => void = () => {}

export function onSeatChange(listener: (seat: Seat | null) => void) {
  seatListener = listener
}

function standUp() {
  if (!currentSeat) return

  // Queda detrás de la silla: sobre ella estaría chocando y no podría moverse
  player.position.z = currentSeat.z - STAND_UP_DISTANCE * currentSeat.facingZ
  player.position.y = STANDING_Y
  currentSeat = null
  seatListener(null)
}

onSeatLost(standUp)

export function restorePlayer({ seatId, x, z }: ResumedPlayer) {
  if (seatId === null) {
    player.position.set(x, STANDING_Y, z)
    return
  }

  currentSeat = seats[seatId]
  player.position.set(currentSeat.x, SEATED_Y, currentSeat.z)
  seatListener(currentSeat)
}

function findNearestSeat() {
  let nearest: Seat | null = null
  let nearestDistance = SIT_DISTANCE

  for (const seat of seats) {
    if (isSeatTaken(seat.id)) continue
    const distance = Math.hypot(seat.x - player.position.x, seat.z - player.position.z)
    if (distance <= nearestDistance) {
      nearest = seat
      nearestDistance = distance
    }
  }

  return nearest
}

export async function toggleSit() {
  if (isRequestingSeat) return

  if (currentSeat) {
    if (isStudyRunning()) return
    standUp()
    leaveSeat()
    return
  }

  const seat = findNearestSeat()
  if (!seat) return

  isRequestingSeat = true
  const taken = await takeSeat(seat.id)
  isRequestingSeat = false
  if (!taken) return

  currentSeat = seat
  player.position.set(seat.x, SEATED_Y, seat.z)
  seatListener(seat)
}

export function updatePlayer(delta: number) {
  if (currentSeat) return
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

export function isNearFreeSeat() {
  return findNearestSeat() !== null
}
