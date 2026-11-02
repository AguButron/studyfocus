import * as THREE from 'three'
import { scene } from './scene'

const WALL_COLOR = 0x585b70
const TABLE_COLOR = 0xa6744f
const CHAIR_COLOR = 0x74543a
const TABLE_POSITIONS = [
  { x: -3, z: -2.5 },
  { x: 3, z: -2.5 },
  { x: -3, z: 2.5 },
  { x: 3, z: 2.5 },
]
const SEAT_OFFSET_X = 0.6
const SEAT_OFFSET_Z = 1.2
export const STANDING_Y = 0.5
export const SEATED_Y = 0.8

export interface Seat {
  id: number
  x: number
  z: number
}

export const seats: Seat[] = []

interface Obstacle {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

const obstacles: Obstacle[] = []

function addBox(width: number, height: number, depth: number, x: number, z: number, color: number, solid = true) {
  if (solid) {
    obstacles.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
    })
  }

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color }),
  )
  box.position.set(x, height / 2, z)
  scene.add(box)
  return box
}

export function collides(x: number, z: number, halfSize: number) {
  return obstacles.some((obstacle) =>
    x + halfSize > obstacle.minX &&
    x - halfSize < obstacle.maxX &&
    z + halfSize > obstacle.minZ &&
    z - halfSize < obstacle.maxZ,
  )
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 12),
  new THREE.MeshStandardMaterial({ color: 0x45475a }),
)
floor.rotation.x = -Math.PI / 2
scene.add(floor)

addBox(12, 2.5, 0.3, 0, -6, WALL_COLOR)
addBox(0.3, 2.5, 12, -6, 0, WALL_COLOR)
addBox(0.3, 2.5, 12, 6, 0, WALL_COLOR)
addBox(12, 0.3, 0.3, 0, 6, WALL_COLOR)

for (const table of TABLE_POSITIONS) {
  addBox(2.4, 0.75, 1.2, table.x, table.z, TABLE_COLOR)

  for (const offsetX of [-SEAT_OFFSET_X, SEAT_OFFSET_X]) {
    for (const offsetZ of [-SEAT_OFFSET_Z, SEAT_OFFSET_Z]) {
      const x = table.x + offsetX
      const z = table.z + offsetZ
      addBox(0.5, 0.45, 0.5, x, z, CHAIR_COLOR, false)
      seats.push({ id: seats.length, x, z })
    }
  }
}