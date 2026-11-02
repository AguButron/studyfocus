import * as THREE from 'three'
import { scene } from './scene'

const WALL_COLOR = 0x585b70
const TABLE_COLOR = 0xa6744f

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

addBox(2.4, 0.75, 1.2, -3, -2.5, TABLE_COLOR)
addBox(2.4, 0.75, 1.2, 3, -2.5, TABLE_COLOR)
addBox(2.4, 0.75, 1.2, -3, 2.5, TABLE_COLOR)
addBox(2.4, 0.75, 1.2, 3, 2.5, TABLE_COLOR)