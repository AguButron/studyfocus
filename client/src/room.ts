import * as THREE from 'three'
import { CHAIR_SIZE, seats, TABLE_DEPTH, TABLE_POSITIONS, TABLE_WIDTH } from './roomLayout'
import { scene } from './scene'

// La sala 3D: el piso, las paredes, las mesas y las sillas. Dónde va cada cosa está en roomLayout
export { CHAIR_SIZE, SEATED_Y, seats, STANDING_Y, TABLE_DEPTH, TABLE_WIDTH, type Seat } from './roomLayout'

const WALL_COLOR = 0x585b70
const TABLE_COLOR = 0xa6744f
const CHAIR_COLOR = 0x74543a

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

// Desde arriba, una pared alta taparía la sala; solo hace falta en primera persona
const tallFrontWall = addBox(12, 2.5, 0.3, 0, 6, WALL_COLOR, false)
tallFrontWall.visible = false

export function setTallFrontWallVisible(visible: boolean) {
  tallFrontWall.visible = visible
}

for (const table of TABLE_POSITIONS) {
  addBox(TABLE_WIDTH, 0.75, TABLE_DEPTH, table.x, table.z, TABLE_COLOR)
}
for (const seat of seats) {
  addBox(CHAIR_SIZE, 0.45, CHAIR_SIZE, seat.x, seat.z, CHAIR_COLOR)
}
