// Dónde va cada mesa y cada silla de la sala. Sin Three.js: lo usan también el plano del menú y la portada,
// que no cargan la escena 3D.

export const TABLE_POSITIONS = [
  { x: -3, z: -2.5 },
  { x: 3, z: -2.5 },
  { x: -3, z: 2.5 },
  { x: 3, z: 2.5 },
]
const SEAT_OFFSET_X = 0.6
const SEAT_OFFSET_Z = 1.2
export const TABLE_WIDTH = 2.4
export const TABLE_DEPTH = 1.2
export const CHAIR_SIZE = 0.5
export const STANDING_Y = 0.5
export const SEATED_Y = 0.8

export interface Seat {
  id: number
  x: number
  z: number
  facingZ: 1 | -1 // hacia dónde queda la mesa
  tableX: number
  tableZ: number
}

// Cuatro sillas por mesa, dos a cada lado
export const seats: Seat[] = TABLE_POSITIONS.flatMap((table) =>
  [-SEAT_OFFSET_X, SEAT_OFFSET_X].flatMap((offsetX) =>
    [-SEAT_OFFSET_Z, SEAT_OFFSET_Z].map((offsetZ) => ({ x: table.x + offsetX, z: table.z + offsetZ, offsetZ, table })),
  ),
).map(({ x, z, offsetZ, table }, id) => ({ id, x, z, facingZ: offsetZ < 0 ? 1 : -1, tableX: table.x, tableZ: table.z }))
