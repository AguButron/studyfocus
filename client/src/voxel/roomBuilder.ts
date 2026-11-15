import { getRoomLayout, layoutSeats } from '../roomLayout'
import { resolveProp, type PropLight } from './props'
import { hash, mix, PER_METER, shade, VoxelSet } from './voxels'

// Arma una sala completa en cubos a partir de su diseño: el piso, las paredes, las mesas y sillas de su tipo
// (las mismas de roomLayout, así los asientos no cambian) y los muebles y adornos que elige el diseño.

export type FloorStyle = 'tablas' | 'parquet' | 'baldosas' | 'alfombra' | 'piedra'
export type WallStyle = 'liso' | 'zocalo' | 'ladrillo' | 'papel' | 'madera'
export type Sky = 'tarde' | 'dia' | 'noche'

export interface RoomTheme {
  floor: { style: FloorStyle; color: number; accent: number }
  wall: { style: WallStyle; color: number; accent: number }
  sky: Sky // la luz que entra: de día, de tarde o de noche
}

export interface PlacedProp {
  id: string // del catálogo (props.ts)
  x: number // en cubos, el centro del mueble
  z: number
  y?: number // si va encima de algo o colgado más arriba o más abajo
  rotation?: number // 0, 90, 180 o 270
  colors?: Record<string, number>
  options?: Record<string, string>
}

export interface RoomDesign {
  id: string
  kind: string // el tipo de sala (roomKinds.ts): decide el tamaño, las mesas y las sillas
  name: string
  description: string
  theme: RoomTheme
  table?: { colors?: Record<string, number>; options?: Record<string, string> } // cómo son sus mesas
  chair?: { colors?: Record<string, number> }
  props: PlacedProp[]
  // Para "Crea tu sala": un tamaño propio, sin las mesas de un tipo (las mesas y sillas van entre los muebles)
  size?: { width: number; depth: number }
}

export const WALL_HEIGHT = 100 // cubos: 2,5 m

export interface BuiltRoom {
  voxels: VoxelSet
  lights: PropLight[] // en cubos, ya en su lugar
  width: number // en cubos
  depth: number
}

// Cada tabla, baldosa, piedra o ladrillo tiene un solo tono (hash), un poco distinto del de al lado: así se ve
// hecho a mano y las caras de un mismo elemento se juntan al dibujar (faceQuads). x y z en cubos de 2,5 cm desde
// la esquina. Las uniones miden un cubo: 2,5 cm
function floorColor(style: FloorStyle, color: number, accent: number, x: number, z: number) {
  switch (style) {
    case 'tablas': {
      // Tablas de 20 cm de ancho y 1,6 m de largo, con las uniones corridas y algún nudo
      const plank = Math.floor(x / 8)
      const along = z + Math.floor(hash(plank, 1) * 64)
      const piece = Math.floor(along / 64)
      if (along % 64 === 0) return shade(color, -0.3)
      if (x % 8 === 0) return shade(color, -0.14)
      if (hash(x >> 1, z >> 1, 3) < 0.003) return shade(color, -0.28)
      return shade(color, (hash(plank, piece) - 0.5) * 0.16)
    }
    case 'parquet': {
      // Cuadros de 40 cm con cuatro listones de 10 cm, que cambian de dirección de un cuadro al otro
      const bx = Math.floor(x / 16)
      const bz = Math.floor(z / 16)
      const across = (bx + bz) % 2 === 1
      const strip = across ? Math.floor((x % 16) / 4) : Math.floor((z % 16) / 4)
      const edge = across ? x % 4 === 0 : z % 4 === 0
      const base = across ? color : accent
      return shade(base, (hash(bx * 8 + strip, bz) - 0.5) * 0.14 - (edge ? 0.1 : 0))
    }
    case 'baldosas': {
      // Damero de baldosas de 30 cm, con su fragüe
      const tx = Math.floor(x / 12)
      const tz = Math.floor(z / 12)
      const tile = (tx + tz) % 2 ? color : accent
      if (x % 12 === 0 || z % 12 === 0) return shade(mix(color, accent, 0.5), -0.1)
      return shade(tile, (hash(tx, tz) - 0.5) * 0.06)
    }
    case 'alfombra':
      // Alfombra de muro a muro: casi pareja, con algunas fibras más oscuras
      return hash(x, z, 5) < 0.1 ? shade(color, -0.07) : color
    case 'piedra': {
      // Piedras de 40 cm de alto y 60 cm de largo, corridas en cada fila, con su junta
      const row = Math.floor(z / 16)
      const shifted = x + (row % 2) * 12
      const stone = Math.floor(shifted / 24)
      if (z % 16 === 0 || shifted % 24 === 0) return shade(accent, -0.2)
      return shade(color, (hash(stone, row) - 0.5) * 0.18)
    }
  }
}

// u: cuántos cubos desde la esquina, a lo largo de la pared; y: la altura en cubos
function wallColor(style: WallStyle, color: number, accent: number, u: number, y: number) {
  switch (style) {
    case 'zocalo': {
      // Arrimadero de 80 cm con paneles en relieve, una moldura arriba y la pared pintada
      if (y < 30) {
        if (u % 24 === 0 || y < 2) return shade(accent, -0.15)
        const inPanel = u % 24 >= 3 && u % 24 <= 21 && y >= 5 && y <= 26
        const panelEdge = inPanel && (u % 24 === 3 || u % 24 === 21 || y === 5 || y === 26)
        return panelEdge ? shade(accent, -0.08) : inPanel ? shade(accent, 0.05) : accent
      }
      if (y === 30) return shade(0xe8e4da, -0.18)
      if (y < 33) return 0xe8e4da
      return color
    }
    case 'ladrillo': {
      // Ladrillos de 7,5 × 22,5 cm, con 2,5 cm de junta, corridos en cada fila
      const row = Math.floor(y / 4)
      const shifted = u + (row % 2) * 5
      if (y % 4 === 3 || shifted % 10 === 0) return shade(accent, 0.2)
      return shade(color, (hash(Math.floor(shifted / 10), row) - 0.5) * 0.18)
    }
    case 'papel':
      // Papel a rayas con florcitas sobre un arrimadero con su moldura
      if (y < 28) return u % 20 === 0 ? shade(accent, -0.12) : accent
      if (y < 30) return shade(accent, 0.25)
      if (Math.floor(u / 6) % 2) return (y + u) % 16 === 0 ? shade(color, 0.12) : color
      return shade(color, -0.07)
    case 'madera': {
      // Tablas verticales de 20 cm, más oscuras abajo
      const board = Math.floor(u / 8)
      if (u % 8 === 0) return shade(color, -0.25)
      return shade(color, (hash(board, 7) - 0.5) * 0.12 - (y < 28 ? 0.1 : 0))
    }
    default:
      // Lisa, con un zócalo de 10 cm
      if (y < 4) return accent
      if (y === 4) return shade(accent, 0.2)
      return color
  }
}

export function buildRoom(design: RoomDesign): BuiltRoom {
  const layout = getRoomLayout(design.kind)
  const width = design.size?.width ?? Math.round(layout.width * PER_METER)
  const depth = design.size?.depth ?? Math.round(layout.depth * PER_METER)
  const x0 = -Math.floor(width / 2)
  const x1 = x0 + width
  const z0 = -Math.floor(depth / 2)
  const z1 = z0 + depth
  const voxels = new VoxelSet(design.id.length * 131 + width)
  const { floor, wall } = design.theme

  // El piso, una capa bajo y = 0
  voxels.fill(x0, -1, z0, x1, 0, z1, (x, _y, z) => floorColor(floor.style, floor.color, floor.accent, x - x0, z - z0), { jitter: 0 })
  // Las paredes de atrás y de los lados, de 5 cm de grueso (2 cubos: más gruesas solo suman cubos que no se ven);
  // adelante, una pared baja de 30 cm
  voxels.fill(x0 - 2, -1, z0 - 2, x1 + 2, WALL_HEIGHT, z0, (x, y) => wallColor(wall.style, wall.color, wall.accent, x - x0, y), { jitter: 0 })
  voxels.fill(x0 - 2, -1, z0, x0, WALL_HEIGHT, z1, (_x, y, z) => wallColor(wall.style, wall.color, wall.accent, z - z0, y), { jitter: 0 })
  voxels.fill(x1, -1, z0, x1 + 2, WALL_HEIGHT, z1, (_x, y, z) => wallColor(wall.style, wall.color, wall.accent, z - z0, y), { jitter: 0 })
  voxels.fill(x0 - 2, -1, z1, x1 + 2, 12, z1 + 2, (_x, y) => (y === 11 ? shade(wall.accent, 0.1) : shade(wall.accent, -0.1)), { jitter: 0 })

  const lights: PropLight[] = []
  const place = (placed: PlacedProp, seed: number) => {
    const resolved = resolveProp(placed.id, placed.colors, placed.options)
    if (!resolved) return
    const piece = new VoxelSet(seed)
    const propLights = resolved.def.build(piece, resolved.colors, resolved.options) ?? []
    const rotation = placed.rotation ?? 0
    const y = placed.y ?? resolved.def.y ?? 0
    const scale = resolved.def.legacy ? 2 : 1
    voxels.merge(piece, placed.x, y, placed.z, rotation, scale)
    for (const light of propLights) {
      const angle = (rotation * Math.PI) / 180
      const lx = Math.round((light.x * Math.cos(angle) + light.z * Math.sin(angle)) * scale)
      const lz = Math.round((-light.x * Math.sin(angle) + light.z * Math.cos(angle)) * scale)
      lights.push({ ...light, x: lx + placed.x, y: light.y * scale + y, z: lz + placed.z })
    }
  }

  // Lo de abajo primero (las alfombras), para que lo demás quede encima
  const ordered = [...design.props].sort((a, b) => Number(b.id === 'rug') - Number(a.id === 'rug'))
  ordered.filter((prop) => prop.id === 'rug').forEach((prop, index) => place(prop, 101 + index))

  // Las mesas y sillas del tipo de sala: en el mismo lugar que en roomLayout
  if (!design.size) {
    for (const [index, table] of layout.tables.entries()) {
      const id = table.oneSided ? 'desk' : table.seatsPerSide === 2 ? 'table4' : 'table2'
      place({ id, x: Math.round(table.x * PER_METER), z: Math.round(table.z * PER_METER), colors: design.table?.colors, options: design.table?.options }, 300 + index)
    }
    for (const seat of layoutSeats(layout)) {
      place({ id: 'chair', x: Math.round(seat.x * PER_METER), z: Math.round(seat.z * PER_METER), rotation: seat.facingZ === 1 ? 0 : 180, colors: design.chair?.colors }, 500 + seat.id)
    }
  }

  ordered.filter((prop) => prop.id !== 'rug').forEach((prop, index) => place(prop, 700 + index))
  return { voxels, lights, width, depth }
}
