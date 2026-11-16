import * as THREE from 'three'
import { buildDecor } from './roomDecor'
import { CHAIR_SIZE, getCurrentLayout, seats, TABLE_DEPTH, tableWidth, useRoomLayout } from './roomLayout'
import { scene } from './scene'
import { getRoomDesign } from './network'
import { designsFor, getDesign } from './voxel/designs'
import { buildFrontWall, buildRoom as buildVoxelRoom, type RoomDesign } from './voxel/roomBuilder'
import { voxelMesh } from './voxel/voxelView'
import { VOXEL_SIZE } from './voxel/voxels'
import { windowWeather } from './voxel/windowWeather'

// La sala 3D: el piso, las paredes, las mesas, las sillas y la decoración. Cómo es cada tipo de sala está en
// roomLayout. Se arma una sola vez por página, al entrar (para ir a otra sala la página se recarga)
export { CHAIR_SIZE, SEATED_Y, seats, STANDING_Y, TABLE_DEPTH, type Seat } from './roomLayout'

const WALL_HEIGHT = 2.5
const WALL_THICKNESS = 0.3

// Las sillas libres se iluminan mientras se elige asiento; la que está bajo el mouse, más
const FREE_CHAIR_GLOW = 0x2f9e5f
const FREE_CHAIR_INTENSITY = 0.35
const HOVERED_CHAIR_INTENSITY = 0.9
// Con el arte en cubos, las sillas de cubos se ven siempre y una caja verde transparente marca las libres
const FREE_CHAIR_OPACITY = 0.3
const HOVERED_CHAIR_OPACITY = 0.55
const VOXEL_SINK = 0.05 // metros: así la cubierta de las mesas en cubos queda a 0,75 m, como lo que va encima
const MAX_VOXEL_LAMPS = 4

function addBox(width: number, height: number, depth: number, x: number, z: number, color: number) {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color }),
  )
  box.position.set(x, height / 2, z)
  scene.add(box)
  return box
}

let tallFrontWall: THREE.Object3D | null = null
let chairs: THREE.Mesh[] = []
let usesVoxels = false

// El arte en cubos (decisión 0033): la sala se arma con el diseño que eligió quien la creó, el mismo para
// todos. Si no tiene uno (una sala de antes), con el primero de su tipo. Los tipos sin diseños todavía
// (Café, Biblioteca y Salón de estudio) usan la sala de siempre
function chosenDesign(kind: string): RoomDesign | null {
  const saved = getRoomDesign()
  const design = (saved ? getDesign(saved) : null) ?? designsFor(kind)[0] ?? null
  return design?.kind === kind ? design : null
}

function buildFromDesign(design: RoomDesign) {
  usesVoxels = true
  const built = buildVoxelRoom(design)
  const { group } = voxelMesh(built.voxels)
  group.add(windowWeather(built.windows))
  group.position.y = -VOXEL_SINK
  scene.add(group)
  for (const source of built.lights.slice(0, MAX_VOXEL_LAMPS)) {
    const lamp = new THREE.PointLight(source.color, source.intensity, source.distance, 1.6)
    lamp.position.set((source.x + 0.5) * VOXEL_SIZE, (source.y + 0.5) * VOXEL_SIZE - VOXEL_SINK, (source.z + 0.5) * VOXEL_SIZE)
    scene.add(lamp)
  }
  // La pared de adelante en cubos, con sus adornos: solo en primera persona
  tallFrontWall = voxelMesh(buildFrontWall(design)).group
  tallFrontWall.position.y = -VOXEL_SINK
  tallFrontWall.visible = false
  scene.add(tallFrontWall)
  // Las sillas para hacer clic: cajas transparentes que envuelven cada silla de cubos (con el respaldo), de un
  // verde que no depende de la luz. Sin elegir asiento no se ven
  chairs = seats.map((seat) => {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(CHAIR_SIZE + 0.12, 1.08, CHAIR_SIZE + 0.12),
      new THREE.MeshBasicMaterial({ color: 0x5fe39a, transparent: true, opacity: 0, depthWrite: false }),
    )
    box.position.set(seat.x, 0.54 - VOXEL_SINK, seat.z)
    scene.add(box)
    return box
  })
}

// Arma la sala del tipo indicado. Llena también la lista de sillas, que usan el personaje y los demás
export function buildRoom(kind: string) {
  const layout = useRoomLayout(kind)
  const { width, depth, wallColor } = layout
  const design = chosenDesign(kind)
  if (design) {
    buildFromDesign(design)
    return
  }

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
    const isFree = freeSeatIds?.has(id) ?? false
    if (usesVoxels) {
      ;(chair.material as THREE.MeshBasicMaterial).opacity = !isFree ? 0 : id === hoveredSeatId ? HOVERED_CHAIR_OPACITY : FREE_CHAIR_OPACITY
      return
    }
    const material = chair.material as THREE.MeshStandardMaterial
    material.emissive.setHex(isFree ? FREE_CHAIR_GLOW : 0x000000)
    material.emissiveIntensity = !isFree ? 0 : id === hoveredSeatId ? HOVERED_CHAIR_INTENSITY : FREE_CHAIR_INTENSITY
  })
}
