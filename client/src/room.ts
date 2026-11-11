import * as THREE from 'three'
import { CHAIR_SIZE, seats, TABLE_DEPTH, TABLE_POSITIONS, TABLE_WIDTH } from './roomLayout'
import { scene } from './scene'

// La sala 3D: el piso, las paredes, las mesas y las sillas. Dónde va cada cosa está en roomLayout
export { CHAIR_SIZE, SEATED_Y, seats, STANDING_Y, TABLE_DEPTH, TABLE_WIDTH, type Seat } from './roomLayout'

const WALL_COLOR = 0x585b70
const TABLE_COLOR = 0xa6744f
const CHAIR_COLOR = 0x74543a

// Las sillas libres se iluminan mientras se elige asiento; la que está bajo el mouse, más
const FREE_CHAIR_GLOW = 0x2f9e5f
const FREE_CHAIR_INTENSITY = 0.35
const HOVERED_CHAIR_INTENSITY = 0.9

function addBox(width: number, height: number, depth: number, x: number, z: number, color: number) {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color }),
  )
  box.position.set(x, height / 2, z)
  scene.add(box)
  return box
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
const tallFrontWall = addBox(12, 2.5, 0.3, 0, 6, WALL_COLOR)
tallFrontWall.visible = false

export function setTallFrontWallVisible(visible: boolean) {
  tallFrontWall.visible = visible
}

for (const table of TABLE_POSITIONS) {
  addBox(TABLE_WIDTH, 0.75, TABLE_DEPTH, table.x, table.z, TABLE_COLOR)
}
// Una silla por asiento, en el mismo orden que seats: el número de silla es su posición
const chairs = seats.map((seat) => addBox(CHAIR_SIZE, 0.45, CHAIR_SIZE, seat.x, seat.z, CHAIR_COLOR))

// La silla bajo el rayo del mouse, si hay alguna
export function findChairAt(raycaster: THREE.Raycaster) {
  const [hit] = raycaster.intersectObjects(chairs, false)
  return hit ? seats[chairs.findIndex((chair) => chair === hit.object)] ?? null : null
}

// Marca las sillas libres mientras se elige asiento; sin elegir, todas se ven normales
export function highlightChairs(freeSeatIds: Set<number> | null, hoveredSeatId: number | null) {
  chairs.forEach((chair, id) => {
    const material = chair.material as THREE.MeshStandardMaterial
    const isFree = freeSeatIds?.has(id) ?? false
    material.emissive.setHex(isFree ? FREE_CHAIR_GLOW : 0x000000)
    material.emissiveIntensity = !isFree ? 0 : id === hoveredSeatId ? HOVERED_CHAIR_INTENSITY : FREE_CHAIR_INTENSITY
  })
}
