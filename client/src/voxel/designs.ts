import { getRoomLayout } from '../roomLayout'
import { ON_TABLE, PROPS_BY_ID } from './props'
import { PER_METER } from './voxels'
import type { PlacedProp, RoomDesign, RoomTheme } from './roomBuilder'

// Los diseños de cada tipo de sala: tres por tipo, para elegir al crear la sala. Todos respetan las mesas y
// sillas de su tipo (roomLayout.ts), así que cambiar de diseño no cambia los asientos. Solo es escenografía.
// Por ahora solo las salas de 1, 2 y 4 personas tienen diseños; el resto sale como "Próximamente" en la galería.
// Posiciones en cubos de 2,5 cm
// Ver docs/decisiones/0033-arte-en-cubos.md

type Extra = Omit<PlacedProp, 'id' | 'x' | 'z'>

// Ayudas para ubicar muebles en una sala de un tipo: pegados a una pared o en el piso, en cubos
function placer(kind: string) {
  const layout = getRoomLayout(kind)
  const width = Math.round(layout.width * PER_METER)
  const depth = Math.round(layout.depth * PER_METER)
  const x0 = -Math.floor(width / 2)
  const x1 = x0 + width
  const z0 = -Math.floor(depth / 2)
  const z1 = z0 + depth
  const halfDepth = (id: string) => Math.floor((PROPS_BY_ID.get(id)?.depth ?? 4) / 2)
  return {
    x0, x1, z0, z1,
    // Contra la pared de atrás, con su centro en x = along
    back: (id: string, along: number, extra: Extra = {}): PlacedProp => ({ id, x: along, z: z0 + halfDepth(id), rotation: 0, ...extra }),
    // Contra la pared izquierda, mirando a la derecha, con su centro en z = along
    left: (id: string, along: number, extra: Extra = {}): PlacedProp => ({ id, x: x0 + halfDepth(id), z: along, rotation: 90, ...extra }),
    right: (id: string, along: number, extra: Extra = {}): PlacedProp => ({ id, x: x1 - 1 - halfDepth(id), z: along, rotation: 270, ...extra }),
    at: (id: string, x: number, z: number, extra: Extra = {}): PlacedProp => ({ id, x, z, ...extra }),
  }
}

const theme = (floor: RoomTheme['floor'], wall: RoomTheme['wall'], sky: RoomTheme['sky']): RoomTheme => ({ floor, wall, sky })

// Lo que hay sobre la mesa de a dos, igual en sus tres diseños: una lata energética al lado del asiento de atrás
// (z = -56) y un café al lado del de adelante (z = 40). La mesa está en z = -8 y mide 64 × 52 cubos.
// Frente a cada asiento queda libre el espacio del computador, cuaderno o libro (activity.ts): 35 cm a cada
// lado de la persona, o sea |x| < 14. Lo de encima de la mesa va en los costados (|x| de 18 a 31)
function duoTable(): PlacedProp[] {
  return [
    { id: 'energyCan', x: -24, z: -26, y: ON_TABLE },
    { id: 'coffee', x: 24, z: 10, y: ON_TABLE },
  ]
}

const solo = placer('solo')
const duo = placer('duo')
const group = placer('group')

export const DESIGNS: RoomDesign[] = [
  // ─── Estudio individual (1) ───
  {
    id: 'solo-noche', kind: 'solo', name: 'Rincón de noche',
    description: 'Tu escritorio frente a la ventana, de noche, con la lámpara y tus libros.',
    theme: theme({ style: 'tablas', color: 0x7c4f35, accent: 0x6b432d }, { style: 'papel', color: 0x3e4a6b, accent: 0x2e3550 }, 'noche'),
    table: { colors: { top: 0xc9925f, body: 0x8a6a4f } },
    props: [
      solo.back('window', 0, { y: 44, options: { sky: 'noche', curtains: 'si' }, colors: { curtain: 0x8c5a7a } }),
      solo.at('tableLamp', -21, -50, { y: 32, rotation: 90, colors: { shade: 0xf2c14e } }),
      solo.at('books', 21, -50, { y: 32 }),
      solo.left('shelfWall', -16),
      solo.at('tallPlant', 60, -52),
      solo.at('rug', 0, 16, { options: { pattern: 'rayas', size: 'mediana' }, colors: { main: 0x4f5d8a, accent: 0x7b88b8 } }),
      solo.right('poster', 8, { colors: { sky: 0x2b3a67, hill: 0x4f5d8a, sun: 0xf6f1d8 } }),
      solo.at('beanbag', 52, 44, { colors: { fabric: 0x8c5a7a } }),
      solo.at('cat', -58, 48, { rotation: 90, colors: { fur: 0x3a3a42, bed: 0x8c5a7a } }),
      solo.left('calendar', 46),
      solo.right('guitar', 52, { colors: { body: 0x8a3b3b } }),
    ],
  },
  {
    id: 'solo-luz', kind: 'solo', name: 'Estudio luminoso',
    description: 'Paredes claras, madera clara, sol de mañana y plantas por todos lados.',
    theme: theme({ style: 'tablas', color: 0xd9b88f, accent: 0xc9a77d }, { style: 'liso', color: 0xeae6dc, accent: 0xcfc8b8 }, 'dia'),
    table: { colors: { top: 0xe8d3b0, body: 0xf4f0e6 } },
    chair: { colors: { wood: 0xd9b88f, seat: 0x7fb8a4 } },
    props: [
      solo.back('window', 0, { y: 44, options: { sky: 'dia' } }),
      solo.left('corkboard', -36),
      solo.at('cactus', 21, -48, { y: 32 }),
      solo.at('plant', -22, -48, { y: 32, colors: { pot: 0xf4f0e6 } }),
      solo.left('hangingPlant', 8),
      solo.right('hangingPlant', -24),
      solo.at('tallPlant', 60, 48, { colors: { pot: 0xf4f0e6 } }),
      solo.at('rug', 0, 24, { options: { pattern: 'borde', size: 'chica' }, colors: { main: 0xe8e2d4, accent: 0x7fb8a4 } }),
      solo.right('shelfWall', 32, { colors: { wood: 0xd9b88f } }),
      solo.at('cat', -56, 44, { rotation: 90 }),
      solo.right('calendar', -56, { colors: { header: 0x7fb8a4 } }),
    ],
  },
  {
    id: 'solo-atico', kind: 'solo', name: 'Ático de madera',
    description: 'Todo de madera, con luces colgando, velas y un puf para descansar.',
    theme: theme({ style: 'parquet', color: 0x9c6b48, accent: 0x8a5a3c }, { style: 'madera', color: 0xa6744f, accent: 0x74543a }, 'tarde'),
    table: { colors: { top: 0x74543a, body: 0x5b3d2a } },
    props: [
      solo.back('window', 0, { y: 44, options: { sky: 'tarde' } }),
      solo.right('stringLights', 0, { y: 92 }),
      solo.at('candles', 21, -48, { y: 32 }),
      solo.at('books', -21, -48, { y: 32 }),
      solo.left('bookshelf', 0, { options: { height: 'medio' } }),
      solo.at('beanbag', 48, 40, { colors: { fabric: 0xd9822b } }),
      solo.at('rug', 8, 20, { options: { pattern: 'cuadros', size: 'mediana' }, colors: { main: 0x8a3b3b, accent: 0xc0504d } }),
      solo.at('plant', 64, -60),
      solo.right('guitar', 40),
      solo.at('lantern', -60, 56),
    ],
  },

  // ─── Estudio de a dos (2) ───
  {
    id: 'duo-ventana', kind: 'duo', name: 'Junto a la ventana',
    description: 'Frente a frente, con el atardecer atrás, un sillón y una lámpara de pie.',
    theme: theme({ style: 'tablas', color: 0x8a5a3c, accent: 0x7c4f35 }, { style: 'zocalo', color: 0x7b7f9e, accent: 0x50536f }, 'tarde'),
    props: [
      duo.back('window', 0),
      duo.at('floorLamp', -96, -88),
      duo.at('armchair', 88, -76, { rotation: 270 }),
      duo.left('cabinet', 16),
      duo.at('plant', -104, 32, { y: 32 }),
      duo.left('shelfWall', 16, { y: 60 }),
      duo.right('poster', 16),
      duo.at('tallPlant', 92, 84),
      duo.at('globe', -96, 80),
      duo.at('cat', 58, -90, { rotation: 270 }),
      duo.right('calendar', -40),
      duo.at('rug', 0, -8, { options: { pattern: 'rombo', size: 'grande' } }),
      duo.at('tableLamp', 25, -8, { y: 32, rotation: 270, colors: { shade: 0xf6e7c1 } }),
      ...duoTable(),
    ],
  },
  {
    id: 'duo-cafe', kind: 'duo', name: 'Café de esquina',
    description: 'Ladrillo, baldosas y una pizarra con el menú del día, como en un café chico.',
    theme: theme({ style: 'baldosas', color: 0xe8e2d4, accent: 0x3c3f4a }, { style: 'ladrillo', color: 0xa0523d, accent: 0x6b4a3a }, 'tarde'),
    table: { colors: { top: 0x3c3f4a, legs: 0x2f2f36 }, options: { size: 'grande' } },
    chair: { colors: { wood: 0x2f2f36, seat: 0x8a3b3b } },
    props: [
      duo.back('chalkboard', 0, { y: 48 }),
      duo.back('stringLights', 0, { y: 92 }),
      duo.left('window', -16, { options: { sky: 'tarde', curtains: 'si' }, colors: { curtain: 0x5d8a7a } }),
      duo.right('bench', -8, { colors: { wood: 0x5b3d2a, cushion: 0x5d8a7a } }),
      duo.right('hangingPlant', 56),
      duo.at('coatRack', -96, -96, { colors: { coat: 0x5d8a7a, scarf: 0xf2c14e } }),
      duo.at('radio', 111, -24, { y: 20, rotation: 270 }),
      duo.at('tableLamp', -26, -8, { y: 32, rotation: 90, colors: { shade: 0x8a3b3b, base: 0x2f2f36 } }),
      ...duoTable(),
      duo.at('tallPlant', -96, 84),
      duo.at('plant', 100, -96),
    ],
  },
  {
    id: 'duo-noche', kind: 'duo', name: 'Noche de estudio',
    description: 'Afuera ya es de noche: mandan las lámparas, la guirnalda y un puf para el descanso.',
    theme: theme({ style: 'alfombra', color: 0x4a4e6b, accent: 0x3a3e58 }, { style: 'papel', color: 0x2e3550, accent: 0x232842 }, 'noche'),
    props: [
      duo.back('window', -24, { options: { sky: 'noche', curtains: 'si' }, colors: { curtain: 0x6b5b95 } }),
      duo.left('stringLights', 0, { y: 88, colors: { bulbs: 0xffb7d5 } }),
      duo.at('floorLamp', -100, -92),
      duo.at('floorLamp', 100, 88, { colors: { shade: 0xf2c14e } }),
      duo.back('bookshelf', 80, { options: { height: 'medio' } }),
      duo.at('beanbag', -88, 72, { colors: { fabric: 0x8c5a7a } }),
      duo.at('beanbag', -56, 88, { colors: { fabric: 0x4f81bd } }),
      duo.at('tableLamp', 25, -8, { y: 32, rotation: 270, colors: { shade: 0xf2c14e } }),
      ...duoTable(),
      duo.right('clock', 0),
      duo.right('guitar', 50, { colors: { body: 0x3a3a42 } }),
      duo.at('cat', -60, 44, { colors: { fur: 0xe8e2d4, bed: 0x4f81bd } }),
      duo.left('calendar', -60, { colors: { header: 0x6b5b95 } }),
    ],
  },

  // ─── Sala de grupo (4) ───
  {
    id: 'group-proyectos', kind: 'group', name: 'Sala de proyectos',
    description: 'Pizarra blanca, diario mural y luz de día: para armar trabajos en grupo.',
    theme: theme({ style: 'tablas', color: 0xc9a77d, accent: 0xb89670 }, { style: 'liso', color: 0xe6e2d8, accent: 0x9aa0a6 }, 'dia'),
    table: { colors: { top: 0xe8d3b0, legs: 0x9aa0a6 } },
    chair: { colors: { wood: 0x3f5f7a, seat: 0x3f5f7a } },
    props: [
      group.back('whiteboard', 0),
      group.back('clock', -84),
      group.left('corkboard', -24),
      group.right('window', -24, { options: { sky: 'dia' } }),
      group.right('bookshelf', 72, { options: { height: 'medio' } }),
      group.at('tallPlant', -116, -108),
      group.at('plant', 120, -116),
      group.back('kanban', 100),
      group.left('tvScreen', 60),
      group.at('waterCooler', -132, 112),
      group.at('rug', 0, 0, { options: { pattern: 'cuadros', size: 'mediana' }, colors: { main: 0x3e5c55, accent: 0x4f7a6f } }),
      group.at('books', 0, 0, { y: 32 }),
    ],
  },
  {
    id: 'group-lectura', kind: 'group', name: 'Club de lectura',
    description: 'Paredes de madera, estantes llenos y sillones para leer en el descanso.',
    theme: theme({ style: 'parquet', color: 0x8a5a3c, accent: 0x74543a }, { style: 'madera', color: 0x8a6a4f, accent: 0x5b3d2a }, 'tarde'),
    table: { colors: { top: 0x74543a, legs: 0x5b3d2a } },
    chair: { colors: { wood: 0x5b3d2a, seat: 0x8a3b3b } },
    props: [
      group.back('bookshelf', -48),
      group.back('bookshelf', 48),
      group.back('clock', 0),
      group.left('window', -16, { options: { sky: 'tarde', curtains: 'si' }, colors: { curtain: 0x8a3b3b } }),
      group.at('armchair', 104, 88, { rotation: 270, colors: { fabric: 0x8a3b3b } }),
      group.at('floorLamp', 116, 48),
      group.right('fireplace', -40),
      group.at('globe', -116, 60),
      group.at('cat', 96, -40, { rotation: 270, colors: { bed: 0x8a3b3b } }),
      group.at('rug', 0, 0, { options: { pattern: 'rombo', size: 'grande' }, colors: { main: 0x6e2f35, accent: 0xc9a227 } }),
      group.at('tableLamp', 0, 0, { y: 32 }),
      group.at('tallPlant', -116, 104),
    ],
  },
  {
    id: 'group-terraza', kind: 'group', name: 'Terraza cubierta',
    description: 'Piso de piedra, ladrillo, ventanales a los dos lados y plantas colgando.',
    theme: theme({ style: 'piedra', color: 0x9aa0a6, accent: 0x6b6f7a }, { style: 'ladrillo', color: 0xb5654a, accent: 0x7a4a3a }, 'dia'),
    table: { colors: { top: 0xd9c9a8, legs: 0x2f2f36 } },
    chair: { colors: { wood: 0x2f2f36, seat: 0xd9c9a8 } },
    props: [
      group.left('window', -40, { options: { sky: 'dia' } }),
      group.right('window', -40, { options: { sky: 'dia' } }),
      group.back('hangingPlant', -80),
      group.back('hangingPlant', 0),
      group.back('hangingPlant', 80),
      group.at('tallPlant', -116, -108),
      group.at('tallPlant', 116, -108),
      group.at('tallPlant', -116, 104),
      group.at('cactus', 120, 108),
      group.back('trellis', -40),
      group.back('trellis', 40),
      group.back('planterBox', -40),
      group.back('planterBox', 40),
      group.at('lantern', -60, 110),
      group.at('lantern', 60, 110),
      group.left('bench', 64, { colors: { cushion: 0x5d8a7a } }),
      group.at('plant', 0, 0, { y: 32 }),
    ],
  },

]

export function designsFor(kind: string) {
  return DESIGNS.filter((design) => design.kind === kind)
}

export function getDesign(id: string) {
  return DESIGNS.find((design) => design.id === id) ?? null
}
