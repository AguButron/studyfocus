import type { ActivityKind } from '../choices'
import { createRandom, hash, mix, shade, VoxelSet } from './voxels'

// Lo que cada persona tiene sobre la mesa al estudiar, en cubos de 2,5 cm: el computador, el cuaderno donde
// escribe y el libro que lee, cada uno con sus variantes (los nombres están en choices.ts). Sin Three.js:
// activity.ts lo arma y lo anima. Coordenadas en cubos: x a la derecha, y hacia arriba desde la cubierta de la
// mesa, z hacia la persona, con el centro del objeto en x = 0, z = 0.
// Lo escrito (la pantalla, las líneas, la tinta) son "píxeles" planos de medio cubo (1,25 cm) pegados a una
// cara: así la letra es más fina que los cubos y se puede ir mostrando de a poco

export interface Pixel {
  u: number // en medios cubos: a lo largo de x
  v: number // en medios cubos: hacia la persona (acostado) o hacia arriba (parado)
  color: number
}

export interface Decal {
  part: 'base' | 'screen' // pegado al objeto o a la pantalla, que se inclina
  plane: 'top' | 'front' // top: acostado a la altura at; front: parado en z = at, mirando a la persona
  at: number // en cubos
  glow: boolean // brilla, como una pantalla
  animated: boolean // aparece de a un píxel, línea por línea, mientras se estudia
  lines: Pixel[][]
}

export interface StudyItem {
  base: VoxelSet
  // La pantalla, que gira desde la bisagra (hingeY, hingeZ, en cubos) y se inclina tilt radianes hacia atrás
  screen?: { set: VoxelSet; hingeY: number; hingeZ: number; tilt: number }
  decals: Decal[]
  flip?: { width: number; depth: number; y: number; color: number } // la hoja que da vuelta en el libro, en cubos
}

const PAGES = 0xf1ead8
const WHITE = 0xf7f6f1
const METAL = 0x9aa0a6
const flat = { jitter: 0 }

type Random = () => number

// Una fila de píxeles de u0 a u1 (sin incluir u1)
const run = (u0: number, u1: number, v: number, color: number): Pixel[] => Array.from({ length: Math.max(0, u1 - u0) }, (_, i) => ({ u: u0 + i, v, color }))

function rect(u0: number, v0: number, u1: number, v1: number, color: number | ((u: number, v: number) => number)) {
  const pixels: Pixel[] = []
  for (let v = v0; v < v1; v++) for (let u = u0; u < u1; u++) pixels.push({ u, v, color: typeof color === 'number' ? color : color(u, v) })
  return pixels
}

// Una línea de texto: palabras de 2 a 6 píxeles con un espacio, de u0 hasta cerca de u1. Con varios colores,
// cada palabra toma uno (como el código en un editor)
function words(random: Random, u0: number, u1: number, v: number, colors: number[]) {
  const pixels: Pixel[] = []
  let u = u0
  while (u < u1 - 1) {
    const length = Math.min(2 + Math.floor(random() * 5), u1 - u)
    pixels.push(...run(u, u + length, v, colors[Math.floor(random() * colors.length)]))
    u += length + 1
  }
  return pixels
}

// Varias líneas de texto, cada una de ancho distinto; la última de cada párrafo, más corta
function paragraph(random: Random, u0: number, u1: number, rows: number[], colors: number[]) {
  return rows.map((v, i) => words(random, u0, i === rows.length - 1 ? u0 + Math.floor((u1 - u0) * (0.4 + random() * 0.3)) : u1 - Math.floor(random() * 3), v, colors))
}

// ─── El computador ───

interface ScreenTheme {
  background: number
  decals(random: Random, left: number, right: number, bottom: number, top: number): { still: Pixel[][]; typed: Pixel[][] }
}

// Un editor de código oscuro: barra de título con sus tres puntos, números de línea y código con sangría
const EDITOR: ScreenTheme = {
  background: 0x1e1e2e,
  decals(random, left, right, bottom, top) {
    const still = [rect(left, top - 2, right, top, 0x313244), [{ u: left + 1, v: top - 1, color: 0xf38ba8 }, { u: left + 3, v: top - 1, color: 0xf9e2af }, { u: left + 5, v: top - 1, color: 0xa6e3a1 }]]
    const rows = Array.from({ length: Math.floor((top - 3 - bottom) / 2) }, (_, i) => top - 4 - i * 2)
    still.push(rows.map((v) => ({ u: left + 1, v, color: 0x585b70 })))
    const indents = [0, 2, 4, 4, 2, 4, 6, 4, 2, 0]
    const colors = [0xcba6f7, 0x89b4fa, 0xa6e3a1, 0xf9e2af, 0xf38ba8, 0xcdd6f4, 0xcdd6f4]
    const typed = rows.map((v, i) => words(random, left + 4 + (indents[i % indents.length] ?? 0), right - 2 - Math.floor(random() * 8), v, colors))
    return { still, typed }
  },
}

// Un documento claro: barra de herramientas, un título en azul y párrafos
const DOCUMENT: ScreenTheme = {
  background: 0xf4f4f0,
  decals(random, left, right, bottom, top) {
    const still = [rect(left, top - 2, right, top, 0xdfe3ea), run(left + 2, left + 4, top - 1, 0x4f81bd), run(left + 6, left + 8, top - 1, 0x9aa0a6)]
    still.push(rect(left + 4, top - 6, left + 4 + Math.floor((right - left) * 0.55), top - 4, 0x4f81bd))
    const rows = Array.from({ length: Math.floor((top - 8 - bottom) / 2) }, (_, i) => top - 8 - i * 2)
    const typed = paragraph(random, left + 4, right - 4, rows.slice(0, 4), [0x6c7086]).concat(paragraph(random, left + 4, right - 4, rows.slice(5), [0x6c7086]))
    return { still, typed }
  },
}

// Una planilla: la fila de encabezado en verde, la grilla y los números que se van llenando en cada celda
const SHEET: ScreenTheme = {
  background: 0xffffff,
  decals(random, left, right, bottom, top) {
    const still = [rect(left, top - 2, right, top, 0x2e7d4f)]
    const grid: Pixel[] = []
    for (let v = bottom; v < top - 2; v++) for (let u = left; u < right; u++) if ((u - left) % 6 === 0 || (top - 3 - v) % 3 === 0) grid.push({ u, v, color: 0xd0d4da })
    still.push(grid)
    const typed: Pixel[][] = []
    for (let v = top - 5; v > bottom; v -= 3) {
      const row: Pixel[] = []
      for (let u = left + 1; u + 4 < right; u += 6) {
        const color = u === left + 1 ? 0x45475a : random() < 0.15 ? 0xc0504d : random() < 0.2 ? 0x2e7d4f : 0x6c7086
        row.push(...run(u + (u === left + 1 ? 0 : 1), u + 2 + Math.floor(random() * 3), v, color))
      }
      typed.push(row)
    }
    return { still, typed }
  },
}

// Un navegador: pestañas, la barra de direcciones, una foto a la izquierda y texto que se va leyendo
const BROWSER: ScreenTheme = {
  background: 0xfbfbfb,
  decals(random, left, right, bottom, top) {
    const still = [rect(left, top - 2, right, top, 0xdfe3ea), rect(left + 1, top - 2, left + 9, top, 0xfbfbfb), rect(left + 2, top - 4, right - 2, top - 3, 0xeceef2)]
    const photoTop = top - 7
    const photoRight = left + Math.floor((right - left) * 0.45)
    still.push(rect(left + 2, photoTop - 10, photoRight, photoTop, (u, v) => {
      if (v < photoTop - 10 + 3 + Math.round(Math.sin(u * 0.5) * 1.5)) return 0x6fa36f
      return (u - photoRight + 4) ** 2 + (v - photoTop + 3) ** 2 < 4 ? 0xf2c14e : 0x8ec5ff
    }))
    still.push(rect(left + 2, photoTop - 13, left + 2 + 10, photoTop - 12, 0x4f81bd))
    const rows = Array.from({ length: Math.floor((photoTop - bottom) / 2) }, (_, i) => photoTop - 1 - i * 2)
    const typed = paragraph(random, photoRight + 2, right - 2, rows.filter((v) => v > photoTop - 12), [0x45475a, 0x6c7086]).concat(
      paragraph(random, left + 2, right - 2, rows.filter((v) => v < photoTop - 14 && v > bottom), [0x6c7086]),
    )
    return { still, typed }
  },
}

function screenDecals(theme: ScreenTheme, seed: number, left: number, right: number, bottom: number, top: number): Decal[] {
  const { still, typed } = theme.decals(createRandom(seed), left, right, bottom, top)
  return [
    { part: 'screen', plane: 'front', at: 0, glow: true, animated: false, lines: still },
    { part: 'screen', plane: 'front', at: 0.02, glow: true, animated: true, lines: typed },
  ]
}

// Un teclado de x0 a x1 y de z0 a z1 en la capa y: teclas de un cubo con dos tonos alternados y la barra
// espaciadora en la fila de adelante
function keyboard(set: VoxelSet, x0: number, x1: number, z0: number, z1: number, y: number, keys: number) {
  set.fill(x0, y, z0, x1, y + 1, z1, (x, _y, z) => {
    if (z === z1 - 1) return x >= x0 + 4 && x < x1 - 4 ? shade(keys, 0.1) : keys
    return (x + z) % 2 ? keys : shade(keys, 0.14)
  }, flat)
}

// Un portátil de 45 × 30 cm: la base con el teclado, el touchpad y la bisagra, y la pantalla de 40 × 25 cm.
// Atrás de la tapa, el logo o los stickers
function laptop(body: number, keys: number, theme: ScreenTheme, seed: number, stickers = false): StudyItem {
  const base = new VoxelSet(seed)
  base.fill(-9, 0, -6, 9, 1, 6, (_x, _y, z) => (z <= -5 ? shade(body, -0.22) : body), flat)
  keyboard(base, -8, 8, -4, 2, 0, keys)
  base.fill(-3, 0, 3, 3, 1, 5, shade(body, 0.12), flat)
  base.put(0, 0, 5, shade(body, -0.18), flat)
  const screen = new VoxelSet(seed + 1)
  screen.fill(-9, 0, -2, 9, 12, -1, body, flat)
  screen.fill(-9, 0, -1, 9, 12, 0, 0x1a1a1e, flat)
  screen.fill(-8, 1, -1, 8, 11, 0, theme.background, { glow: 0.8, jitter: 0 })
  screen.put(0, 11, -1, 0x2f2f36, flat)
  if (stickers) {
    for (const [x, y, color] of [[-6, 8, 0xf2c14e], [-5, 8, 0xf2c14e], [3, 3, 0xe8738f], [4, 3, 0xe8738f], [4, 4, 0xe8738f], [-3, 4, 0x7fd3e0], [6, 9, 0xa6e3a1]]) screen.put(x, y, -2, color, flat)
  } else {
    screen.fill(-1, 6, -2, 1, 8, -1, shade(body, 0.25), flat)
  }
  return { base, screen: { set: screen, hingeY: 1, hingeZ: -4, tilt: 0.25 }, decals: screenDecals(theme, seed, -16, 16, 2, 22) }
}

// Un computador de escritorio: el monitor de 60 cm en su pie, el teclado y el mouse sobre su alfombrilla
function desktop(seed: number): StudyItem {
  const base = new VoxelSet(seed)
  const dark = 0x2f3036
  // El pie no pasa del centro de la mesa (13 cubos atrás): ahí empieza el lado de quien se sienta enfrente
  base.fill(-5, 0, -13, 5, 1, -8, (x, _y, z) => (x === -5 || x === 4 || z === -13 ? shade(dark, -0.2) : dark), flat)
  base.fill(-1, 1, -13, 1, 7, -12, shade(dark, 0.1), flat)
  base.fill(-8, 0, 0, 8, 1, 6, 0xd8dbe0, flat)
  keyboard(base, -7, 7, 1, 6, 0, 0x45475a)
  base.fill(10, 0, 0, 17, 1, 7, 0x3a3d46, flat)
  base.fill(12, 1, 2, 14, 2, 5, 0xeceef2, flat)
  base.put(12, 1, 2, 0xc9ccd2, flat)
  const screen = new VoxelSet(seed + 1)
  screen.fill(-12, 0, -2, 12, 15, -1, dark, flat)
  screen.fill(-12, 0, -1, 12, 15, 0, 0x1a1a1e, flat)
  screen.fill(-11, 1, -1, 11, 14, 0, BROWSER.background, { glow: 0.8, jitter: 0 })
  screen.put(9, 0, -1, 0x7fd3e0, { glow: 1, jitter: 0 })
  return { base, screen: { set: screen, hingeY: 5, hingeZ: -10, tilt: 0.06 }, decals: screenDecals(BROWSER, seed, -22, 22, 2, 28) }
}

// ─── El cuaderno ───

// La tinta que se va escribiendo: palabras sobre cada renglón, de margen a margen
function handwriting(seed: number, u0: number, u1: number, rows: number[], color: number) {
  const random = createRandom(seed)
  return rows.map((v, i) => words(random, u0 + (i % 5 === 0 ? 2 : 0), i % 5 === 4 ? u0 + Math.floor((u1 - u0) * 0.5) : u1 - Math.floor(random() * 4), v, [color, color, shade(color, 0.15)]))
}

// Un cuaderno universitario de 35 × 45 cm: la tapa asoma en el borde, el espiral arriba, renglones celestes y el
// margen rojo, y la tinta azul
function spiralNotebook(cover: number): StudyItem {
  const base = new VoxelSet(21)
  base.fill(-7, 0, -9, 7, 1, 9, (x, _y, z) => (z === -9 || x === -7 || x === 6 || z === 8 ? cover : WHITE), flat)
  for (let x = -6; x < 7; x += 2) base.put(x, 1, -9, METAL, flat)
  const rules = Array.from({ length: 11 }, (_, i) => -13 + i * 3)
  return {
    base,
    decals: [
      { part: 'base', plane: 'top', at: 1, glow: false, animated: false, lines: [...rules.map((v) => run(-12, 12, v, 0xc9d6e8)), rect(-9, -15, -8, 16, () => 0xe8a0a0)] },
      { part: 'base', plane: 'top', at: 1.02, glow: false, animated: true, lines: handwriting(22, -7, 11, rules.map((v) => v - 1), 0x2f4a8a) },
    ],
  }
}

// Una libreta de tapa negra con hojas cuadriculadas y un elástico; se escribe con lápiz pasta negro,
// con cuentas y algún recuadro
function gridNotebook(): StudyItem {
  const base = new VoxelSet(31)
  base.fill(-6, 0, -9, 6, 1, 9, (x, _y, z) => (x === -6 || x === 5 || z === -9 || z === 8 ? 0x2f2f36 : WHITE), flat)
  base.fill(4, 1, -9, 5, 2, 9, 0xc0504d, flat)
  const grid: Pixel[] = []
  for (let v = -16; v < 16; v++) for (let u = -10; u < 8; u++) if (u % 3 === 0 || v % 3 === 0) grid.push({ u, v, color: 0xdbe6f0 })
  const rows = Array.from({ length: 10 }, (_, i) => -14 + i * 3)
  const ink = handwriting(32, -9, 7, rows, 0x26262c)
  ink[3] = [...run(-9, -1, rows[3], 0x26262c), ...run(0, 2, rows[3], 0xc0504d), ...run(3, 7, rows[3], 0x26262c)]
  ink.push([...run(-9, 7, rows[9] + 1, 0xc0504d)])
  return {
    base,
    decals: [
      { part: 'base', plane: 'top', at: 1, glow: false, animated: false, lines: [grid] },
      { part: 'base', plane: 'top', at: 1.02, glow: false, animated: true, lines: ink },
    ],
  }
}

// Dos hojas sueltas, una un poco corrida bajo la otra, con partes destacadas en amarillo y el destacador al lado
function looseSheets(): StudyItem {
  const base = new VoxelSet(41)
  base.fill(-5, 0, -8, 9, 1, 10, 0xe8e6de, flat)
  base.fill(-7, 0, -9, 7, 1, 9, WHITE, flat)
  base.fill(8, 0, -5, 9, 1, 3, 0xf2e14e)
  base.fill(8, 0, 3, 9, 1, 5, 0x3a3d46)
  base.put(8, 0, -6, 0xc9b23a, flat)
  const rows = Array.from({ length: 13 }, (_, i) => -15 + i * 2.5).map(Math.round)
  const highlights = [rows[2], rows[6], rows[7], rows[11]].map((v, i) => run(-10 + i * 2, 4 + i, v, 0xfff27a))
  return {
    base,
    decals: [
      { part: 'base', plane: 'top', at: 1, glow: false, animated: false, lines: [...highlights, run(-11, -4, -17, 0xb0b4bc)] },
      { part: 'base', plane: 'top', at: 1.02, glow: false, animated: true, lines: handwriting(42, -11, 12, rows, 0x1f2a44) },
    ],
  }
}

// ─── El libro ───

// Las páginas de un lado: un bloque con el canto rayado (las hojas) y la orilla de afuera más baja
function pageBlock(set: VoxelSet, x0: number, x1: number, z0: number, z1: number, thick: number, outer: number) {
  set.fill(x0, 1, z0, x1, 1 + thick, z1, (x, y, z) => {
    if (x === outer || z === z0 || z === z1 - 1) return (y + z) % 2 ? shade(PAGES, -0.1) : shade(PAGES, -0.03)
    return PAGES
  }, flat)
}

// Texto impreso en una página, de u0 a u1, desde arriba hacia la persona, con un título opcional
function printed(seed: number, u0: number, u1: number, v0: number, v1: number, title: boolean, gap = 2) {
  const random = createRandom(seed)
  const lines: Pixel[][] = []
  let v = v0
  if (title) {
    lines.push(rect(u0, v, u0 + Math.floor((u1 - u0) * 0.6), v + 2, 0x2b3a67))
    v += 4
  }
  let line = 0
  while (v < v1) {
    lines.push(line % 6 === 5 ? [] : words(random, u0 + (line % 6 === 0 ? 2 : 0), line % 6 === 4 ? u0 + Math.floor((u1 - u0) * 0.5) : u1, v, [0x5a5d66]))
    v += gap
    line++
  }
  return lines.flat()
}

// Un libro de estudio de tapa dura (50 × 35 cm abierto), grueso, con un gráfico en la página derecha
function textbook(cover: number): StudyItem {
  const base = new VoxelSet(51)
  base.fill(-10, 0, -7, 10, 1, 7, cover, flat)
  pageBlock(base, -9, 0, -6, 6, 2, -9)
  pageBlock(base, 0, 9, -6, 6, 2, 8)
  for (let z = -6; z < 6; z++) {
    base.remove(-1, 2, z)
    base.remove(0, 2, z)
  }
  base.fill(-1, 1, 6, 0, 2, 7, 0xc0304d, flat)
  const bars = [[3, 6, 0x4f81bd], [6, 10, 0xc0504d], [9, 4, 0x9bbb59], [12, 8, 0xf2c14e]].flatMap(([u, height, color]) => rect(u, 2 - height, u + 2, 2, color))
  return {
    base,
    decals: [
      {
        part: 'base', plane: 'top', at: 3, glow: false, animated: false,
        lines: [printed(52, -17, -3, -10, 11, true), [...run(2, 16, 2, 0x5a5d66), ...rect(2, -9, 3, 2, () => 0x5a5d66), ...bars], printed(53, 2, 16, 5, 11, false)],
      },
    ],
    flip: { width: 8, depth: 11, y: 3, color: 0xf7f2e4 },
  }
}

// Una novela de bolsillo (35 × 25 cm abierta): letra chica y apretada, y el número de página abajo
function novel(cover: number): StudyItem {
  const base = new VoxelSet(61)
  base.fill(-7, 0, -5, 7, 1, 5, cover, flat)
  pageBlock(base, -6, 0, -4, 4, 1, -6)
  pageBlock(base, 0, 6, -4, 4, 1, 5)
  return {
    base,
    decals: [
      {
        part: 'base', plane: 'top', at: 2, glow: false, animated: false,
        lines: [printed(62, -11, -2, -7, 6, false), printed(63, 2, 11, -7, 6, false), [{ u: -6, v: 7, color: 0x9a9ca3 }, { u: 6, v: 7, color: 0x9a9ca3 }]],
      },
    ],
    flip: { width: 5, depth: 7, y: 2, color: 0xf7f2e4 },
  }
}

// Un atlas grande (55 × 40 cm abierto): texto a la izquierda y un mapa a página completa a la derecha, con mar,
// tierra, cerros, un río y la rosa de los vientos
function atlas(): StudyItem {
  const base = new VoxelSet(71)
  base.fill(-11, 0, -8, 11, 1, 8, 0x2f6b6b, flat)
  pageBlock(base, -10, 0, -7, 7, 1, -10)
  pageBlock(base, 0, 10, -7, 7, 1, 9)
  const map = rect(2, -12, 19, 13, (u, v) => {
    const land = hash(u >> 2, v >> 2, 7) * 0.6 + hash(u >> 3, v >> 3, 9) * 0.6 - Math.abs(u - 10) * 0.025
    if (Math.abs(u - 9 - Math.round(Math.sin(v * 0.4) * 2)) < 1 && land > 0.55) return 0x5aa0e6
    if (land > 0.85) return 0xc9a86b
    if (land > 0.62) return mix(0x7fb069, 0x4f8a4f, hash(u, v, 3) * 0.5)
    if (land > 0.56) return 0xe8d9a8
    return 0x8ec5ff
  })
  const compass = [[16, 9], [16, 8], [16, 10], [15, 9], [17, 9]].map(([u, v]) => ({ u, v, color: 0x2b3a67 }))
  return {
    base,
    decals: [
      { part: 'base', plane: 'top', at: 2, glow: false, animated: false, lines: [printed(72, -18, -3, -12, 13, true), map, compass, run(2, 19, -13, 0x2b3a67)] },
    ],
    flip: { width: 9, depth: 13, y: 2, color: 0xf7f2e4 },
  }
}

const BUILDERS: Record<ActivityKind, (() => StudyItem)[]> = {
  computer: [
    () => laptop(0x3a3d46, 0x24262c, EDITOR, 11),
    () => laptop(0xc9ccd2, 0x3a3d46, DOCUMENT, 12),
    () => laptop(0xa8c5e0, 0x2f3b55, SHEET, 13, true),
    () => desktop(14),
  ],
  writing: [() => spiralNotebook(0x3e5c55), gridNotebook, looseSheets],
  reading: [() => textbook(0x7a3b3b), () => novel(0x2f4a6b), atlas],
}

export function buildStudyItem(kind: ActivityKind, item: number) {
  const builders = BUILDERS[kind]
  return builders[Math.min(Math.max(0, item), builders.length - 1)]()
}
