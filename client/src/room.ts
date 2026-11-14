import * as THREE from 'three'
import { buildDecor } from './roomDecor'
import { CHAIR_SIZE, getCurrentLayout, seats, TABLE_DEPTH, tableWidth, useRoomLayout } from './roomLayout'
import { scene } from './scene'

// La sala 3D: el piso, las paredes, las mesas, las sillas y la decoración. Cómo es cada tipo de sala está en
// roomLayout. Se arma una sola vez por página, al entrar (para ir a otra sala la página se recarga)
export { CHAIR_SIZE, SEATED_Y, seats, STANDING_Y, TABLE_DEPTH, type Seat } from './roomLayout'

const WALL_HEIGHT = 2.5
const WALL_THICKNESS = 0.3

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

let tallFrontWall: THREE.Mesh | null = null
let chairs: THREE.Mesh[] = []

// Arma la sala del tipo indicado. Llena también la lista de sillas, que usan el personaje y los demás
export function buildRoom(kind: string) {
  const layout = useRoomLayout(kind)
  const { width, depth, wallColor } = layout

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshStandardMaterial({ color: layout.floorColor }))
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  addBox(width, WALL_HEIGHT, WALL_THICKNESS, 0, -depth / 2, wallColor)
  addBox(WALL_THICKNESS, WALL_HEIGHT, depth, -width / 2, 0, wallColor)
  addBox(WALL_THICKNESS, WALL_HEIGHT, depth, width / 2, 0, wallColor)
  addBox(width, WALL_THICKNESS, WALL_THICKNESS, 0, depth / 2, wallColor)

  // Desde arriba, una pared alta taparía la sala; solo hace falta en primera persona
  tallFrontWall = addBox(width, WALL_HEIGHT, WALL_THICKNESS, 0, depth / 2, wallColor)
  tallFrontWall.visible = false

  for (const table of layout.tables) {
    addBox(tableWidth(table), 0.75, TABLE_DEPTH, table.x, table.z, layout.tableColor)
  }
  // Una silla por asiento, en el mismo orden que seats: el número de silla es su posición
  chairs = seats.map((seat) => addBox(CHAIR_SIZE, 0.45, CHAIR_SIZE, seat.x, seat.z, layout.chairColor))

  scene.add(buildDecor(layout.decor))
}

export function setTallFrontWallVisible(visible: boolean) {
  if (tallFrontWall) tallFrontWall.visible = visible
}

// Hasta dónde puede llegar la cámara sin pasar las paredes
export function getRoomBounds() {
  const { width, depth } = getCurrentLayout()
  return { halfWidth: width / 2 - 0.5, halfDepth: depth / 2 - 0.5 }
}

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
