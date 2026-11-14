// Cómo es cada tipo de sala: su tamaño, sus colores, dónde va cada mesa y silla, y su decoración. Sin Three.js:
// lo usan también el plano del menú y la portada, que no cargan la escena 3D.
// La decoración es de bloques, como todo por ahora; más adelante cada cosa tendrá su propio arte.
// Ver docs/decisiones/0031-tipos-de-sala.md

export const TABLE_DEPTH = 1.2
export const CHAIR_SIZE = 0.5
export const STANDING_Y = 0.5
export const SEATED_Y = 0.8
const SEAT_SPACING_X = 1.2 // entre las dos sillas de un mismo lado de una mesa de cuatro
const SEAT_OFFSET_Z = 1.2 // desde el centro de la mesa hasta cada silla

export interface TableSpot {
  x: number
  z: number
  seatsPerSide: 1 | 2 // una mesa de dos o de cuatro, con la mitad a cada lado
  oneSided?: boolean // un escritorio contra la pared: las sillas van solo adelante
}

// Lo que adorna la sala. facing es hacia dónde mira, en grados: 0 mira hacia la cámara (+z), 90 hacia la derecha
// (+x, para la pared izquierda), 270 hacia la izquierda y 180 hacia atrás.
// - Lo que se apoya en una pared (estantes, muebles, la barra) va con x y z en su parte de atrás.
// - Lo que cuelga de una pared (ventanas, pizarras, relojes, afiches) va con x y z en la línea de la pared y su altura en y.
// - El resto (plantas, alfombras, lámparas, sillones) va con x y z en su centro; y es la altura si va encima de algo
export type DecorKind =
  | 'shelf' // estante con libros
  | 'window'
  | 'whiteboard'
  | 'chalkboard' // la pizarra del menú del café
  | 'clock'
  | 'poster'
  | 'plant'
  | 'tallPlant'
  | 'rug'
  | 'tableLamp' // lámpara de biblioteca, sobre una mesa
  | 'floorLamp'
  | 'armchair'
  | 'counter' // la barra del café, con su cafetera
  | 'cabinet' // mueble bajo

export interface Decor {
  kind: DecorKind
  x: number
  z: number
  y?: number
  facing?: 0 | 90 | 180 | 270
  width?: number
  height?: number
  depth?: number
  color?: number
}

export interface RoomLayout {
  id: string
  width: number // de izquierda a derecha (x)
  depth: number // de atrás hacia adelante (z): la cámara de arriba mira desde adelante
  floorColor: number
  wallColor: number
  tableColor: number
  chairColor: number
  tables: TableSpot[]
  decor: Decor[]
}

export interface Seat {
  id: number
  x: number
  z: number
  facingZ: 1 | -1 // hacia dónde queda la mesa
  tableX: number
  tableZ: number
}

export const tableWidth = (table: TableSpot) => table.seatsPerSide * SEAT_SPACING_X

// Las sillas de una mesa: de izquierda a derecha, y en cada posición primero la de atrás y después la de adelante.
// El número de silla es el orden en la sala, así que no debe cambiar en una sala que ya existe
export function layoutSeats(layout: RoomLayout): Seat[] {
  return layout.tables
    .flatMap((table) => {
      const offsetsX = table.seatsPerSide === 2 ? [-SEAT_SPACING_X / 2, SEAT_SPACING_X / 2] : [0]
      return offsetsX.flatMap((offsetX) =>
        (table.oneSided ? [SEAT_OFFSET_Z * 0.6] : [-SEAT_OFFSET_Z, SEAT_OFFSET_Z]).map((offsetZ) => ({ x: table.x + offsetX, z: table.z + offsetZ, offsetZ, table })),
      )
    })
    .map(({ x, z, offsetZ, table }, id) => ({ id, x, z, facingZ: offsetZ < 0 ? 1 : -1, tableX: table.x, tableZ: table.z }))
}

const WOOD = 0xa6744f
const DARK_WOOD = 0x74543a

export const ROOM_LAYOUTS: Record<string, RoomLayout> = {
  // 1 persona: el estudio individual. En 3D es tu escritorio (deskScene.ts, con sus propios adornos);
  // esto es solo su plano para la tarjeta del menú
  solo: {
    id: 'solo',
    width: 4,
    depth: 3.6,
    floorColor: 0x5b4a3f,
    wallColor: 0x6c6f85,
    tableColor: WOOD,
    chairColor: DARK_WOOD,
    tables: [{ x: 0, z: -1.15, seatsPerSide: 1, oneSided: true }],
    decor: [
      { kind: 'rug', x: 0, z: 0.1, width: 2.4, depth: 1.8 },
      { kind: 'shelf', x: -1.95, z: -0.6, facing: 90, width: 1.2 },
      { kind: 'cabinet', x: 1.95, z: 0.3, facing: 270, width: 1 },
    ],
  },

  // 2 personas: un rincón tranquilo, frente a frente, junto a una ventana grande
  duo: {
    id: 'duo',
    width: 6,
    depth: 5.5,
    floorColor: 0x5b4a3f,
    wallColor: 0x6c6f85,
    tableColor: WOOD,
    chairColor: DARK_WOOD,
    tables: [{ x: 0, z: -0.2, seatsPerSide: 1 }],
    decor: [
      { kind: 'rug', x: 0, z: -0.2, width: 2.6, depth: 3.4, color: 0x8c5a7a },
      { kind: 'window', x: 0, z: -2.75, y: 1.4, width: 2.4, height: 1.3 },
      { kind: 'floorLamp', x: -2.4, z: -2.2 },
      { kind: 'armchair', x: 2.2, z: -1.8, facing: 270, color: 0x7f8cc4 },
      { kind: 'cabinet', x: -2.8, z: 0.4, facing: 90, width: 1.4, height: 0.8 },
      { kind: 'plant', x: -2.55, z: 0.4, y: 0.8 },
      { kind: 'poster', x: 3, z: 0.4, y: 1.5, facing: 270, width: 0.9, height: 1.2, color: 0xf2a65a },
      { kind: 'tallPlant', x: 2.4, z: 2.2 },
    ],
  },

  // 4 personas: una mesa para trabajar en grupo, con pizarra
  group: {
    id: 'group',
    width: 7,
    depth: 6.5,
    floorColor: 0x4a4e5f,
    wallColor: 0x5d6a78,
    tableColor: 0xc9b79c,
    chairColor: 0x3f5f7a,
    tables: [{ x: 0, z: 0, seatsPerSide: 2 }],
    decor: [
      { kind: 'rug', x: 0, z: 0, width: 3.6, depth: 3.8, color: 0x3e5c55 },
      { kind: 'whiteboard', x: 0, z: -3.25, y: 1.45, width: 3, height: 1.3 },
      { kind: 'shelf', x: -3.3, z: -1.2, facing: 90, width: 1.8, height: 1.9 },
      { kind: 'window', x: 3.5, z: -0.6, y: 1.4, facing: 270, width: 2, height: 1.2 },
      { kind: 'tallPlant', x: -2.9, z: 2.75 },
      { kind: 'plant', x: 2.9, z: -2.75 },
      { kind: 'clock', x: -1.9, z: -3.25, y: 1.9 },
      { kind: 'cabinet', x: 3.3, z: 1.9, facing: 270, width: 1.4, height: 0.8 },
      { kind: 'plant', x: 3.05, z: 1.9, y: 0.8 },
    ],
  },

  // 8 personas: un café de estudio, con mesitas de a dos y la barra al fondo
  cafe: {
    id: 'cafe',
    width: 9,
    depth: 9,
    floorColor: 0x6b4f3a,
    wallColor: 0x7a5c4d,
    tableColor: 0xd8cdb8,
    chairColor: 0x9c6b48,
    tables: [
      { x: -2.1, z: -0.8, seatsPerSide: 1 },
      { x: 2.1, z: -0.8, seatsPerSide: 1 },
      { x: -2.1, z: 2.5, seatsPerSide: 1 },
      { x: 2.1, z: 2.5, seatsPerSide: 1 },
    ],
    decor: [
      { kind: 'counter', x: 0, z: -4.3, width: 5, depth: 0.8 },
      { kind: 'chalkboard', x: 0, z: -4.5, y: 1.9, width: 2.4, height: 0.9 },
      { kind: 'shelf', x: -3.4, z: -4.3, width: 1.6, height: 2.1 },
      { kind: 'shelf', x: 3.4, z: -4.3, width: 1.6, height: 2.1 },
      { kind: 'window', x: -4.5, z: 0.8, y: 1.4, facing: 90, width: 2.6, height: 1.3 },
      { kind: 'window', x: 4.5, z: 0.8, y: 1.4, facing: 270, width: 2.6, height: 1.3 },
      { kind: 'tallPlant', x: -3.9, z: 3.9 },
      { kind: 'tallPlant', x: 3.9, z: 3.9 },
      { kind: 'plant', x: 0, z: 0.9 },
      { kind: 'rug', x: 0, z: 0.85, width: 1.4, depth: 6.2, color: 0x8a3b3b },
    ],
  },

  // 12 personas: una biblioteca, con tres mesas largas en fila y estantes en las paredes
  library: {
    id: 'library',
    width: 13,
    depth: 9,
    floorColor: 0x4b3a2f,
    wallColor: 0x5e4b3c,
    tableColor: 0x7a5236,
    chairColor: 0x4f3626,
    tables: [
      { x: -4.2, z: 0.4, seatsPerSide: 2 },
      { x: 0, z: 0.4, seatsPerSide: 2 },
      { x: 4.2, z: 0.4, seatsPerSide: 2 },
    ],
    decor: [
      { kind: 'rug', x: 0, z: 0.4, width: 12, depth: 3.9, color: 0x6e2f35 },
      { kind: 'shelf', x: -4.8, z: -4.3, width: 2.4, height: 2.3 },
      { kind: 'shelf', x: -2.3, z: -4.3, width: 2.4, height: 2.3 },
      { kind: 'shelf', x: 2.3, z: -4.3, width: 2.4, height: 2.3 },
      { kind: 'shelf', x: 4.8, z: -4.3, width: 2.4, height: 2.3 },
      { kind: 'clock', x: 0, z: -4.5, y: 1.8 },
      { kind: 'shelf', x: -6.3, z: -2.2, facing: 90, width: 2.2, height: 2.3 },
      { kind: 'shelf', x: 6.3, z: -2.2, facing: 270, width: 2.2, height: 2.3 },
      { kind: 'window', x: -6.5, z: 2, y: 1.4, facing: 90, width: 2, height: 1.3 },
      { kind: 'window', x: 6.5, z: 2, y: 1.4, facing: 270, width: 2, height: 1.3 },
      { kind: 'tableLamp', x: -4.2, z: 0.4 },
      { kind: 'tableLamp', x: 0, z: 0.4 },
      { kind: 'tableLamp', x: 4.2, z: 0.4 },
      { kind: 'tallPlant', x: -6, z: 3.9 },
      { kind: 'tallPlant', x: 6, z: 3.9 },
    ],
  },

  // 16 personas: el salón de siempre, con ventanas, estantes y un pasillo al medio
  study: {
    id: 'study',
    width: 12,
    depth: 12,
    floorColor: 0x45475a,
    wallColor: 0x585b70,
    tableColor: WOOD,
    chairColor: DARK_WOOD,
    tables: [
      { x: -3, z: -2.5, seatsPerSide: 2 },
      { x: 3, z: -2.5, seatsPerSide: 2 },
      { x: -3, z: 2.5, seatsPerSide: 2 },
      { x: 3, z: 2.5, seatsPerSide: 2 },
    ],
    decor: [
      { kind: 'rug', x: 0, z: 0.3, width: 1.6, depth: 10.4, color: 0x2f5d62 },
      { kind: 'window', x: 0, z: -6, y: 1.45, width: 3, height: 1.4 },
      { kind: 'clock', x: 0, z: -6, y: 2.35 },
      { kind: 'shelf', x: -3.6, z: -5.8, width: 2.8, height: 2.1 },
      { kind: 'shelf', x: 3.6, z: -5.8, width: 2.8, height: 2.1 },
      { kind: 'window', x: -6, z: 0, y: 1.4, facing: 90, width: 2.4, height: 1.3 },
      { kind: 'window', x: 6, z: 0, y: 1.4, facing: 270, width: 2.4, height: 1.3 },
      { kind: 'tallPlant', x: -5.4, z: -5.4 },
      { kind: 'tallPlant', x: 5.4, z: -5.4 },
      { kind: 'plant', x: -5.4, z: 5.3 },
      { kind: 'plant', x: 5.4, z: 5.3 },
      { kind: 'poster', x: -6, z: -3.6, y: 1.5, facing: 90, width: 0.9, height: 1.2, color: 0x89b4fa },
      { kind: 'poster', x: 6, z: 3.6, y: 1.5, facing: 270, width: 0.9, height: 1.2, color: 0xa6e3a1 },
    ],
  },
}

export function getRoomLayout(kind: string) {
  return ROOM_LAYOUTS[kind] ?? ROOM_LAYOUTS.study
}

// Las sillas de la sala en la que se está: se llenan al entrar, antes de armar la escena
export const seats: Seat[] = []
let currentLayout: RoomLayout = ROOM_LAYOUTS.study

export function useRoomLayout(kind: string) {
  currentLayout = getRoomLayout(kind)
  seats.splice(0, seats.length, ...layoutSeats(currentLayout))
  return currentLayout
}

export function getCurrentLayout() {
  return currentLayout
}
