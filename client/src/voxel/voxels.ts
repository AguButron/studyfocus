// El núcleo del arte en cubos: un conjunto de cubos de 2,5 cm, cada uno con su color y, si brilla, cuánto.
// Sin Three.js, para que lo puedan usar el menú y el modo "Crea tu sala" sin cargar la escena.
// Las coordenadas son enteras, en cubos: x hacia la derecha, y hacia arriba (el piso queda bajo y = 0), z hacia adelante.
// Ver docs/decisiones/0033-arte-en-cubos.md

export const VOXEL_SIZE = 0.025 // metros
export const PER_METER = 40 // cubos en un metro: las posiciones en metros de roomLayout × 40 son cubos

export interface Voxel {
  color: number
  glow: number // 0 no brilla; 1 brilla del todo (ventanas, lámparas, pantallas)
}

export type ColorFn = number | ((x: number, y: number, z: number) => number)

export interface PutOptions {
  glow?: number
  jitter?: number // cuánto varía el tono, para que se vea dibujado a mano
}

// Un número al azar que se repite igual cada vez: la misma sala sale siempre igual
export function createRandom(seed: number) {
  let value = Math.abs(Math.floor(seed)) % 2147483646 || 1
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

// Un tono un poco más claro u oscuro, sin cambiar el color
export function shade(color: number, amount: number) {
  const r = (color >> 16) & 255
  const g = (color >> 8) & 255
  const b = color & 255
  const scale = (channel: number) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount))))
  return (scale(r) << 16) | (scale(g) << 8) | scale(b)
}

export function mix(a: number, b: number, t: number) {
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t)
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

// Cada cubo se guarda como un número (no un texto "x,y,z" ni un objeto): con cubos de 2,5 cm una sala tiene
// cientos de miles, y así se arma y se recorre varias veces más rápido y ocupa mucho menos memoria.
// x y z van de -512 a 511 (±12,8 m) e y de -256 a 255 (±6,4 m)
const keyOf = (x: number, y: number, z: number) => ((x + 512) * 1024 + (z + 512)) * 512 + (y + 256)
const GLOW = 2 ** 24 // el valor es color + brillo (0 a 100) × GLOW

export class VoxelSet {
  private readonly cells = new Map<number, number>()
  private random: () => number
  private readonly seed: number

  constructor(seed = 7) {
    this.seed = seed
    this.random = createRandom(seed)
  }

  // El tono varía por bloques de 2 × 2 × 2 cubos (5 cm), no por cubo: se sigue viendo hecho a mano, y las caras
  // vecinas del mismo tono se juntan al dibujar (faceQuads), así no se cuadruplican los triángulos
  put(x: number, y: number, z: number, color: number, { glow = 0, jitter = 0.05 }: PutOptions = {}) {
    const varied = jitter ? shade(color, (hash(x >> 1, y >> 1, (z >> 1) + this.seed * 131 + color) - 0.5) * jitter * 2) : color
    this.cells.set(keyOf(x, y, z), varied + Math.round(glow * 100) * GLOW)
  }

  remove(x: number, y: number, z: number) {
    this.cells.delete(keyOf(x, y, z))
  }

  has(x: number, y: number, z: number) {
    return this.cells.has(keyOf(x, y, z))
  }

  // Un bloque de cubos de x0 a x1, sin incluir x1 (igual en y y z)
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: ColorFn, options?: PutOptions) {
    for (let x = Math.min(x0, x1); x < Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y < Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z < Math.max(z0, z1); z++) {
          this.put(x, y, z, typeof color === 'function' ? color(x, y, z) : color, options)
        }
  }

  // Al azar, pero siempre igual en la misma sala
  next() {
    return this.random()
  }

  // Recorre los cubos: posición, color y brillo (0 a 1)
  forEach(visit: (x: number, y: number, z: number, color: number, glow: number) => void) {
    for (const [key, value] of this.cells) {
      const y = (key % 512) - 256
      const xz = Math.floor(key / 512)
      visit(Math.floor(xz / 1024) - 512, y, (xz % 1024) - 512, value % GLOW, Math.floor(value / GLOW) / 100)
    }
  }

  // Suma otro conjunto girado (0, 90, 180 o 270 grados alrededor de su centro) y movido a x, z.
  // Con scale 2, cada cubo del otro se vuelve 2 × 2 × 2: para los muebles dibujados con cubos de 5 cm
  merge(other: VoxelSet, x: number, y: number, z: number, rotation = 0, scale = 1) {
    other.forEach((lx, ly, lz, color, glow) => {
      const value = color + Math.round(glow * 100) * GLOW
      for (let dx = 0; dx < scale; dx++)
        for (let dy = 0; dy < scale; dy++)
          for (let dz = 0; dz < scale; dz++) {
            const [rx, rz] = rotate(lx * scale + dx, lz * scale + dz, rotation)
            this.cells.set(keyOf(rx + x, ly * scale + dy + y, rz + z), value)
          }
    })
  }

  get size() {
    return this.cells.size
  }
}

// Gira un punto en el piso. 0 mira hacia +z (hacia la cámara), 90 hacia +x, 180 hacia -z y 270 hacia -x
export function rotate(x: number, z: number, rotation: number): [number, number] {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [z, -x]
    case 180:
      return [-x, -z]
    case 270:
      return [-z, x]
    default:
      return [x, z]
  }
}

// Un tono fijo para cada (a, b): sirve para que una tabla, una baldosa o un ladrillo entero tenga el mismo tono
export function hash(a: number, b: number, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

// Una cara grande hecha de caras de cubos vecinas del mismo color, todas mirando hacia el mismo lado
export interface FaceQuad {
  axis: number // 0 x, 1 y, 2 z: hacia dónde mira la cara
  sign: 1 | -1
  plane: number // dónde está la cara en ese eje, en cubos
  u: number // dónde empieza en los otros dos ejes ((axis + 1) % 3 y (axis + 2) % 3), en cubos
  v: number
  width: number // cuántos cubos ocupa en cada uno
  height: number
  color: number
  glow: number
}

// Las caras que se ven (las que no tocan otro cubo), juntando las vecinas del mismo color y brillo en caras
// más grandes (greedy meshing): un piso de tablas de un solo tono por tabla queda en unas pocas caras por tabla.
// Las caras que miran hacia abajo bajo el piso (y < 0) no se juntan ni se dibujan: la cámara nunca mira desde abajo
export function faceQuads(set: VoxelSet) {
  const slices = new Map<number, { axis: number; sign: 1 | -1; plane: number; cells: number[] }>()
  const p = [0, 0, 0]
  const n = [0, 0, 0]
  set.forEach((x, y, z, color, glow) => {
    p[0] = x; p[1] = y; p[2] = z
    const id = color | (Math.round(glow * 100) << 24)
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [1, -1] as const) {
        if (axis === 1 && sign === -1 && y < 0) continue
        n[0] = x; n[1] = y; n[2] = z
        n[axis] += sign
        if (set.has(n[0], n[1], n[2])) continue
        const plane = p[axis] + (sign === 1 ? 1 : 0)
        const sliceKey = (axis * 2 + (sign === 1 ? 1 : 0)) * 4096 + plane + 2048
        let slice = slices.get(sliceKey)
        if (!slice) slices.set(sliceKey, (slice = { axis, sign, plane, cells: [] }))
        slice.cells.push(p[(axis + 1) % 3], p[(axis + 2) % 3], id)
      }
  })
  const quads: FaceQuad[] = []
  for (const { axis, sign, plane, cells } of slices.values()) {
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity
    for (let i = 0; i < cells.length; i += 3) {
      u0 = Math.min(u0, cells[i]); u1 = Math.max(u1, cells[i])
      v0 = Math.min(v0, cells[i + 1]); v1 = Math.max(v1, cells[i + 1])
    }
    const w = u1 - u0 + 1
    const h = v1 - v0 + 1
    const grid = new Int32Array(w * h).fill(-1)
    for (let i = 0; i < cells.length; i += 3) grid[(cells[i + 1] - v0) * w + cells[i] - u0] = cells[i + 2]
    for (let v = 0; v < h; v++)
      for (let u = 0; u < w; u++) {
        const id = grid[v * w + u]
        if (id === -1) continue
        let width = 1
        while (u + width < w && grid[v * w + u + width] === id) width++
        let height = 1
        grow: while (v + height < h) {
          for (let k = 0; k < width; k++) if (grid[(v + height) * w + u + k] !== id) break grow
          height++
        }
        for (let dv = 0; dv < height; dv++) grid.fill(-1, (v + dv) * w + u, (v + dv) * w + u + width)
        quads.push({ axis, sign, plane, u: u + u0, v: v + v0, width, height, color: id & 0xffffff, glow: (id >>> 24) / 100 })
      }
  }
  return quads
}
