import { hash, mix, shade, type ColorFn, type PutOptions, VoxelSet } from './voxels'

// El catálogo de muebles y adornos en cubos. Cada uno se arma centrado en su lugar del piso, mirando hacia +z;
// lo que va contra una pared tiene su parte de atrás en z = -depth / 2. Los usan los diseños de cada sala y el
// modo "Crea tu sala", donde se pueden mover, girar y cambiar de color. Todo en cubos de 2,5 cm: lo que va sobre
// una mesa o un mueble bajo parte en y = 32 (80 cm). Los que dicen legacy siguen dibujados en cubos de 5 cm
// y se agrandan al doble al ponerlos (no se usan en las salas de 1, 2 y 4 personas).

export type PropCategory = 'mesas' | 'asientos' | 'muebles' | 'pared' | 'luces' | 'plantas' | 'piso'

export interface PropLight {
  x: number
  y: number
  z: number
  color: number
  intensity: number
  distance: number // metros
}

export interface PropDef {
  id: string
  name: string
  category: PropCategory
  width: number // en cubos de 2,5 cm, de izquierda a derecha
  depth: number // de atrás hacia adelante
  onWall?: boolean // cuelga de una pared: se pega a ella al ubicarlo
  y?: number // a qué altura va, en cubos (lo que cuelga, o lo que va sobre una mesa)
  legacy?: boolean // dibujado con cubos de 5 cm: build usa esas medidas y se agranda al doble al ponerlo
  colors: Record<string, { label: string; value: number }>
  options?: Record<string, { label: string; values: string[] }>
  build(set: VoxelSet, colors: Record<string, number>, options: Record<string, string>): PropLight[] | void
}

export const ON_TABLE = 32 // 80 cm: donde parte lo que va sobre una mesa

const BOOKS = [0xc0504d, 0x4f81bd, 0xf2c14e, 0x9bbb59, 0x8064a2, 0xe8e2d4, 0x4bacc6, 0xd9822b, 0x3e5c55, 0x7a3b3b, 0x2f4a6b]
const PAGES = 0xf1ead8
const LEAF = 0x4f9d5d
const LEAF_DARK = 0x3a7a48
const LEAF_LIGHT = 0x74c47f
const STEM = 0x35663f
const METAL = 0x2f2f36
const WHITE = 0xf4f4f0
const CREAM = 0xf4f0e6
const SOIL = 0x4a3426
const GLASS = 0xc9e4f2
const INK = 0x1a1a1e
const TERRACOTTA = 0xb5654a
const BARK = 0x6b4a33

const half = (size: number) => Math.floor(size / 2)
const pick = <T,>(set: VoxelSet, list: T[]) => list[Math.floor(set.next() * list.length)]
const flat = { jitter: 0 }

// Un disco de cubos de radio r con centro en (cx, cz), de y0 a y1. Con inner, un anillo
function disc(set: VoxelSet, cx: number, cz: number, y0: number, y1: number, r: number, color: ColorFn, options?: PutOptions, inner = 0) {
  const reach = Math.ceil(r)
  for (let x = Math.floor(cx - reach); x < cx + reach; x++)
    for (let z = Math.floor(cz - reach); z < cz + reach; z++) {
      const d = (x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2
      if (d > r * r || d < inner * inner) continue
      for (let y = y0; y < y1; y++) set.put(x, y, z, typeof color === 'function' ? color(x, y, z) : color, options)
    }
}

// Libros parados entre x0 y x1, de 5 a 10 cm de grueso y alturas distintas, con el lomo hacia +z: dos franjas
// claras arriba, a veces una oscura abajo y una etiqueta en los gruesos, las hojas a la vista arriba y algunos
// más metidos que otros
function books(set: VoxelSet, x0: number, x1: number, y: number, z0: number, z1: number, minHeight: number, maxHeight: number) {
  let x = x0
  while (x < x1) {
    const roll = set.next()
    const width = Math.min(roll < 0.5 ? 2 : roll < 0.85 ? 3 : 4, x1 - x)
    if (set.next() > 0.07) {
      const height = minHeight + Math.floor(set.next() * (maxHeight - minHeight + 1))
      const color = pick(set, BOOKS)
      const front = set.next() < 0.3 ? z1 - 1 : z1
      set.fill(x, y, z0, x + width, y + height, front, color, { jitter: 0.03 })
      set.fill(x, y + height - 1, z0, x + width, y + height, front - 1, PAGES, { jitter: 0.02 })
      if (height >= 7) {
        set.fill(x, y + height - 3, front - 1, x + width, y + height - 2, front, shade(color, 0.4), flat)
        set.fill(x, y + height - 5, front - 1, x + width, y + height - 4, front, shade(color, 0.4), flat)
      }
      if (height >= 10 && set.next() < 0.5) set.fill(x, y + 2, front - 1, x + width, y + 3, front, shade(color, -0.3), flat)
      if (width >= 3 && height >= 10) set.fill(x + 1, y + Math.floor(height / 2) - 1, front - 1, x + width - 1, y + Math.floor(height / 2) + 1, front, shade(color, 0.6), flat)
    }
    x += width
  }
}

// Un libro acostado: tapas del color del libro y las hojas a la vista por tres lados. Responde dónde termina arriba
function flatBook(set: VoxelSet, x0: number, z0: number, x1: number, z1: number, y: number, color: number, thick = 3) {
  set.fill(x0, y, z0, x1, y + thick, z1, color, { jitter: 0.02 })
  if (thick >= 3) {
    set.fill(x0 + 1, y + 1, z1 - 1, x1, y + thick - 1, z1, PAGES, { jitter: 0.02 })
    set.fill(x0 + 1, y + 1, z0, x1, y + thick - 1, z0 + 1, PAGES, { jitter: 0.02 })
    set.fill(x1 - 1, y + 1, z0, x1, y + thick - 1, z1, PAGES, { jitter: 0.02 })
  }
  return y + thick
}

// Hojas sueltas: tallos que salen del centro en todas direcciones, cada uno con una hoja que se ensancha al medio
// y cae un poco en la punta
function foliage(set: VoxelSet, cx: number, cy: number, cz: number, radius: number, count: number, colors = [LEAF, LEAF_DARK, LEAF_LIGHT]) {
  for (let i = 0; i < count; i++) {
    const angle = set.next() * Math.PI * 2
    const rise = set.next() * 1.35 - 0.35
    const length = radius * (0.55 + set.next() * 0.45)
    const dx = Math.cos(rise) * Math.cos(angle)
    const dy = Math.sin(rise)
    const dz = Math.cos(rise) * Math.sin(angle)
    const color = pick(set, colors)
    const sideX = Math.round(-dz)
    const sideZ = Math.round(dx)
    for (let t = 0; t <= length; t += 0.6) {
      const droop = t > length * 0.5 ? -((t - length * 0.5) ** 2) * 0.07 : 0
      const x = Math.round(cx + dx * t)
      const y = Math.round(cy + dy * t + droop)
      const z = Math.round(cz + dz * t)
      if (t < length * 0.3) {
        if (!set.has(x, y, z)) set.put(x, y, z, STEM, { jitter: 0.06 })
        continue
      }
      set.put(x, y, z, color, { jitter: 0.07 })
      // La hoja se ensancha al medio, con la nervadura más oscura
      if (t > length * 0.42 && t < length * 0.88) {
        set.put(x + sideX, y, z + sideZ, shade(color, 0.08), { jitter: 0.07 })
        if (t > length * 0.55 && t < length * 0.75) set.put(x - sideX, y, z - sideZ, shade(color, 0.08), { jitter: 0.07 })
      }
    }
  }
}

// Las patas de una mesa o un mueble, de size × size cubos, en sus cuatro esquinas, con el pie más oscuro
function legs(set: VoxelSet, x0: number, z0: number, x1: number, z1: number, height: number, color: number, inset = 0, size = 2) {
  for (const [x, z] of [[x0 + inset, z0 + inset], [x1 - size - inset, z0 + inset], [x0 + inset, z1 - size - inset], [x1 - size - inset, z1 - size - inset]]) {
    set.fill(x, 1, z, x + size, height, z + size, color)
    set.fill(x, 0, z, x + size, 1, z + size, shade(color, -0.2))
  }
}

// Una cubierta de madera de thick cubos, en tablas a lo largo de x con una unión fina, y el canto más oscuro
function woodTop(set: VoxelSet, x0: number, y: number, z0: number, x1: number, z1: number, color: number, plank = 8, thick = 2) {
  set.fill(x0, y, z0, x1, y + thick, z1, (x, py, z) => {
    if (x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1) return shade(color, py === y + thick - 1 ? -0.06 : -0.16)
    if ((z - z0) % plank === 0) return shade(color, -0.07)
    return shade(color, (hash(Math.floor((z - z0) / plank), 11) - 0.5) * 0.12)
  }, flat)
}

// Un marco de width cubos alrededor de un rectángulo (de x0 a x1 e y0 a y1, sin tocarlo)
function frameRing(set: VoxelSet, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, color: number, width = 1) {
  set.fill(x0 - width, y0 - width, z0, x1 + width, y0, z1, color, { jitter: 0.02 })
  set.fill(x0 - width, y1, z0, x1 + width, y1 + width, z1, color, { jitter: 0.02 })
  set.fill(x0 - width, y0, z0, x0, y1, z1, color, { jitter: 0.02 })
  set.fill(x1, y0, z0, x1 + width, y1, z1, color, { jitter: 0.02 })
}

// Un cojín: un bloque con las esquinas de adelante comidas y el canto de arriba redondeado
function cushion(set: VoxelSet, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number) {
  set.fill(x0, y0, z0, x1, y1, z1, color)
  for (let x = x0; x < x1; x++) set.remove(x, y1 - 1, z1 - 1)
  for (const x of [x0, x1 - 1]) {
    set.remove(x, y0, z1 - 1)
    set.remove(x, y1 - 1, z1 - 2)
  }
}

// Trazos de escritura: palabras de 3 a 8 cubos con espacios, de x0 a x1 en la fila y (y z)
function scribble(set: VoxelSet, x0: number, x1: number, y: number, z: number, color: number) {
  let x = x0
  while (x < x1 - 2) {
    const word = Math.min(3 + Math.floor(set.next() * 6), x1 - x)
    set.fill(x, y, z, x + word, y + 1, z + 1, color, flat)
    x += word + 2
  }
}

export const SKIES: Record<string, [number, number, number]> = {
  tarde: [0xe8a87c, 0x6b5b95, 0x2b3a67],
  dia: [0xcfe8ff, 0x8ec5ff, 0x5aa0e6],
  noche: [0x2a2f55, 0x1a1d3a, 0x0e1024],
}

export const PROPS: PropDef[] = [
  // ─── Mesas ───
  {
    id: 'table4', name: 'Mesa de 4', category: 'mesas', width: 96, depth: 48,
    colors: { top: { label: 'Cubierta', value: 0xc9925f }, legs: { label: 'Patas', value: 0x74543a } },
    build(set, c) {
      woodTop(set, -48, 30, -24, 48, 24, c.top)
      const apron = shade(c.top, -0.22)
      set.fill(-43, 25, -20, 43, 30, -19, apron)
      set.fill(-43, 25, 19, 43, 30, 20, apron)
      set.fill(-44, 25, -20, -43, 30, 20, apron)
      set.fill(43, 25, -20, 44, 30, 20, apron)
      legs(set, -48, -24, 48, 24, 30, c.legs, 3, 3)
    },
  },
  {
    // La de la sala de a dos: 1,6 × 1,3 m, un poco más grande que antes, para que quepan las cosas de los dos
    id: 'table2', name: 'Mesa de 2', category: 'mesas', width: 64, depth: 52,
    colors: { top: { label: 'Cubierta', value: 0xc9925f }, legs: { label: 'Patas', value: 0x74543a } },
    options: { shape: { label: 'Forma', values: ['cuadrada', 'redonda'] }, size: { label: 'Tamaño', values: ['normal', 'grande'] } },
    build(set, c, o) {
      // La grande (solo cuadrada) mide 1,8 × 1,4 m: 4 cubos más por lado a lo ancho y 2 a lo hondo
      const [w, d] = o.size === 'grande' ? [36, 28] : [32, 26]
      if (o.shape === 'redonda') {
        disc(set, 0, 0, 30, 32, 27, (x, y, z) => ((x + 0.5) ** 2 + (z + 0.5) ** 2 > 26 ** 2 ? shade(c.top, y === 31 ? -0.08 : -0.18) : c.top), flat)
        disc(set, 0, 0, 27, 30, 6, shade(c.legs, 0.08))
        disc(set, 0, 0, 4, 27, 2, c.legs)
        disc(set, 0, 0, 2, 4, 5, c.legs)
        disc(set, 0, 0, 0, 2, 11, shade(c.legs, -0.2))
      } else {
        woodTop(set, -w, 30, -d, w, d, c.top)
        const apron = shade(c.top, -0.22)
        set.fill(5 - w, 25, 4 - d, w - 5, 30, 5 - d, apron)
        set.fill(5 - w, 25, d - 5, w - 5, 30, d - 4, apron)
        set.fill(4 - w, 25, 4 - d, 5 - w, 30, d - 4, apron)
        set.fill(w - 5, 25, 4 - d, w - 4, 30, d - 4, apron)
        legs(set, -w, -d, w, d, 30, c.legs, 3, 3)
      }
    },
  },
  {
    id: 'desk', name: 'Escritorio', category: 'mesas', width: 56, depth: 28,
    colors: { top: { label: 'Cubierta', value: 0xc9925f }, body: { label: 'Cajones', value: 0x8a6a4f } },
    build(set, c) {
      woodTop(set, -28, 30, -14, 28, 14, c.top)
      // Los cajones a la derecha, con su zócalo, frentes separados por ranuras y manillas
      set.fill(10, 2, -14, 28, 30, 12, c.body)
      set.fill(12, 0, -12, 26, 2, 10, shade(c.body, -0.35))
      for (const [y0, y1] of [[2, 10], [11, 20], [21, 29]]) {
        const middle = Math.floor((y0 + y1) / 2)
        set.fill(11, y0, 12, 27, y1, 13, (x, y) => (x === 11 || x === 26 || y === y0 || y === y1 - 1 ? shade(c.body, 0.02) : shade(c.body, 0.1)))
        set.fill(16, middle, 13, 22, middle + 1, 14, 0xd9c9a8, flat)
      }
      // El costado izquierdo y el panel de atrás
      set.fill(-28, 2, -14, -25, 30, 14, c.body)
      set.fill(-28, 0, -14, -25, 2, 14, shade(c.body, -0.3))
      set.fill(-25, 16, -14, 10, 30, -12, shade(c.body, -0.12))
    },
  },
  {
    id: 'coffeeTable', name: 'Mesa de centro', category: 'mesas', width: 40, depth: 24, legacy: true,
    colors: { top: { label: 'Cubierta', value: 0x8a6a4f } },
    build(set, c) {
      woodTop(set, -10, 7, -6, 10, 6, c.top, 3, 1)
      legs(set, -10, -6, 10, 6, 7, shade(c.top, -0.25), 1, 2)
      set.fill(-8, 2, -4, 8, 3, 4, shade(c.top, -0.12))
      flatBook(set, -7, -3, -1, 2, 3, BOOKS[1], 2)
      const y = flatBook(set, -7, -3, 0, 3, 8, BOOKS[0], 2)
      flatBook(set, -6, -2, -1, 2, y, BOOKS[2], 1)
      // Una taza con café y su asa
      set.fill(3, 8, -1, 5, 10, 1, WHITE)
      set.put(5, 9, 0, WHITE)
      set.put(3, 9, -1, 0x6b4a33, flat)
    },
  },

  // ─── Asientos ───
  {
    id: 'chair', name: 'Silla', category: 'asientos', width: 20, depth: 20,
    colors: { wood: { label: 'Madera', value: 0x74543a }, seat: { label: 'Asiento', value: 0x74543a } },
    build(set, c) {
      legs(set, -10, -10, 10, 10, 16, c.wood)
      set.fill(-10, 6, -8, -8, 7, 8, shade(c.wood, -0.12))
      set.fill(8, 6, -8, 10, 7, 8, shade(c.wood, -0.12))
      set.fill(-8, 6, 8, 8, 7, 10, shade(c.wood, -0.12))
      set.fill(-10, 16, -10, 10, 18, 10, shade(c.wood, -0.08))
      cushion(set, -9, 18, -8, 9, 20, 10, shade(c.seat, 0.1))
      // El respaldo: dos postes, un travesaño redondeado arriba, otro abajo y tres listones
      set.fill(-10, 18, -10, -8, 36, -8, c.wood)
      set.fill(8, 18, -10, 10, 36, -8, c.wood)
      set.fill(-10, 36, -10, 10, 42, -8, c.wood)
      set.fill(-8, 21, -10, 8, 23, -8, shade(c.wood, -0.06))
      for (const x of [-10, 9]) {
        set.remove(x, 41, -10)
        set.remove(x, 41, -9)
      }
      set.fill(-9, 41, -10, 9, 42, -8, shade(c.wood, 0.08))
      for (const [x0, x1] of [[-6, -4], [-1, 1], [4, 6]]) set.fill(x0, 23, -10, x1, 36, -9, shade(c.wood, 0.12))
    },
  },
  {
    id: 'armchair', name: 'Sillón', category: 'asientos', width: 36, depth: 36,
    colors: { fabric: { label: 'Tela', value: 0x7f8cc4 }, blanket: { label: 'Manta', value: 0xb79dcf } },
    build(set, c) {
      const dark = shade(c.fabric, -0.22)
      for (const [x, z] of [[-17, -17], [14, -17], [-17, 14], [14, 14]]) set.fill(x, 0, z, x + 3, 4, z + 3, 0x5b3d2a)
      set.fill(-18, 4, -18, 18, 16, 18, (_x, y) => (y < 6 ? shade(c.fabric, -0.32) : dark))
      // El respaldo, con su cojín capitoneado
      set.fill(-18, 16, -18, 18, 42, -10, c.fabric)
      set.fill(-16, 42, -17, 16, 44, -10, c.fabric)
      set.fill(-12, 22, -10, 12, 40, -6, shade(c.fabric, 0.06))
      set.fill(-10, 40, -10, 10, 42, -8, shade(c.fabric, 0.06))
      for (const [x, y] of [[-6, 34], [5, 34], [-6, 27], [5, 27], [0, 30]]) set.put(x, y, -7, shade(c.fabric, -0.2), flat)
      // Los brazos, redondeados arriba
      set.fill(-18, 16, -10, -12, 28, 18, dark)
      set.fill(12, 16, -10, 18, 28, 18, dark)
      set.fill(-17, 28, -10, -13, 30, 17, dark)
      set.fill(13, 28, -10, 17, 30, 17, dark)
      // El cojín del asiento, con el canto de adelante redondeado
      cushion(set, -12, 16, -6, 12, 22, 18, c.fabric)
      // Una manta a cuadros doblada sobre el brazo derecho, colgando por fuera, con flecos
      const plaid = (x: number, y: number, z: number) => (z % 4 === 0 ? shade(c.blanket, -0.28) : (Math.floor(z / 4) + Math.floor((x + y) / 4)) % 2 ? c.blanket : shade(c.blanket, -0.15))
      set.fill(12, 30, -2, 18, 31, 10, plaid)
      set.fill(18, 12, -2, 19, 31, 10, plaid)
      for (let z = -2; z < 10; z += 2) set.fill(18, 10, z, 19, 12, z + 1, CREAM)
    },
  },
  {
    id: 'sofa', name: 'Sofá', category: 'asientos', width: 72, depth: 32, legacy: true,
    colors: { fabric: { label: 'Tela', value: 0x5d8a7a }, pillow: { label: 'Cojines', value: 0xf2a65a } },
    build(set, c) {
      const dark = shade(c.fabric, -0.22)
      const seam = (x: number) => x === -5 || x === 4
      for (const [x, z] of [[-18, -8], [16, -8], [-18, 6], [16, 6]]) set.fill(x, 0, z, x + 2, 2, z + 2, 0x5b3d2a)
      set.fill(-18, 2, -8, 18, 8, 8, (_x, y) => (y === 2 ? shade(c.fabric, -0.32) : dark))
      set.fill(-18, 8, -8, 18, 20, -4, c.fabric)
      set.fill(-17, 20, -7, 17, 21, -4, c.fabric)
      set.fill(-18, 8, -4, -14, 14, 8, dark)
      set.fill(14, 8, -4, 18, 14, 8, dark)
      set.fill(-17, 14, -4, -14, 15, 7, dark)
      set.fill(14, 14, -4, 17, 15, 7, dark)
      // Tres cojines de asiento y tres de respaldo, separados por costuras
      set.fill(-14, 8, -4, 14, 10, 8, (x) => (seam(x) ? shade(c.fabric, -0.14) : c.fabric))
      set.fill(-14, 10, -4, 14, 11, 7, (x) => (seam(x) ? shade(c.fabric, -0.14) : shade(c.fabric, 0.05)))
      set.fill(-14, 11, -4, 14, 19, -2, (x) => (seam(x) ? shade(c.fabric, -0.1) : shade(c.fabric, 0.07)))
      // Dos cojines sueltos, redondeados, con un botón al medio
      cushion(set, -13, 11, -2, -8, 17, 0, c.pillow)
      cushion(set, 7, 11, -2, 12, 17, 0, shade(c.pillow, -0.15))
      set.put(-11, 14, -1, shade(c.pillow, -0.25), flat)
      set.put(9, 14, -1, shade(c.pillow, -0.35), flat)
    },
  },
  {
    id: 'beanbag', name: 'Puf', category: 'asientos', width: 28, depth: 28,
    colors: { fabric: { label: 'Tela', value: 0xe07a5f } },
    build(set, c) {
      for (let x = -14; x < 14; x++)
        for (let z = -14; z < 14; z++)
          for (let y = 0; y < 24; y++) {
            const nx = (x + 0.5) / 14
            const nz = (z + 0.5) / 14
            const body = nx * nx + nz * nz + ((y + 0.5 - 6) / 13) ** 2 <= 1
            const back = (nx / 0.8) ** 2 + ((z + 0.5 + 7) / 6.4) ** 2 + ((y + 0.5 - 14) / 9) ** 2 <= 1
            const dent = y >= 14 && (x + 0.5) ** 2 + ((z + 0.5 - 3) / 1.2) ** 2 < 64
            if (!(body || back) || dent) continue
            // Costuras entre los paños, y la parte de arriba más clara
            const seamLine = Math.abs(Math.sin(Math.atan2(z + 0.5, x + 0.5) * 3)) < 0.09
            set.put(x, y, z, seamLine ? shade(c.fabric, -0.14) : y >= 12 ? shade(c.fabric, 0.1) : c.fabric)
          }
    },
  },
  {
    id: 'bench', name: 'Banca', category: 'asientos', width: 64, depth: 16,
    colors: { wood: { label: 'Madera', value: 0xa6744f }, cushion: { label: 'Cojín', value: 0x8a3b3b } },
    build(set, c) {
      // Dos patas de tabla con un arco abajo, unidas por un travesaño
      const leg = shade(c.wood, -0.25)
      for (const x of [-28, 24]) {
        set.fill(x, 0, -8, x + 4, 14, 8, leg)
        for (let y = 0; y < 6; y++) for (let z = -4; z < 4; z++) if (y < 4 || Math.abs(z + 0.5) < 3) for (let dx = 0; dx < 4; dx++) set.remove(x + dx, y, z)
      }
      set.fill(-24, 6, -2, 24, 8, 2, shade(c.wood, -0.2))
      set.fill(-32, 14, -8, 32, 16, 8, (_x, _y, z) => ((z + 8) % 4 === 3 ? shade(c.wood, -0.18) : shade(c.wood, (hash(z >> 2, 5) - 0.5) * 0.12)), { jitter: 0.02 })
      set.fill(-30, 16, -7, 30, 18, 7, c.cushion)
      set.fill(-28, 18, -6, 28, 20, 6, shade(c.cushion, 0.08))
      for (const x of [-20, -10, 8, 18]) set.put(x, 19, 0, shade(c.cushion, -0.25), flat)
    },
  },

  // ─── Muebles ───
  {
    id: 'bookshelf', name: 'Estante con libros', category: 'muebles', width: 64, depth: 16,
    colors: { wood: { label: 'Madera', value: 0x5b3d2a } },
    options: { height: { label: 'Alto', values: ['alto', 'medio', 'bajo'] } },
    build(set, c, o) {
      const height = o.height === 'bajo' ? 40 : o.height === 'medio' ? 64 : 88
      set.fill(-30, 4, -8, 30, height - 4, -6, shade(c.wood, -0.2))
      set.fill(-32, 0, -8, -30, height, 8, c.wood)
      set.fill(30, 0, -8, 32, height, 8, c.wood)
      set.fill(-30, 0, -8, 30, 4, 6, shade(c.wood, -0.3))
      // La moldura de arriba, que sobresale
      set.fill(-32, height - 4, -8, 32, height - 2, 8, c.wood)
      set.fill(-34, height - 2, -8, 34, height, 10, shade(c.wood, 0.08))
      set.fill(-34, height - 2, 9, 34, height - 1, 10, shade(c.wood, -0.08))
      for (let y = 4; y < height - 4; y += 20) {
        set.fill(-30, y, -8, 30, y + 2, 8, (_x, _y, z) => (z === 7 ? shade(c.wood, -0.06) : shade(c.wood, 0.04)))
        const space = Math.min(18, height - 4 - (y + 2))
        if (space < 8) continue
        const maxHeight = Math.min(16, space)
        const mode = set.next()
        if (mode < 0.4) books(set, -30, 30, y + 2, -6, 6, maxHeight - 6, maxHeight)
        else if (mode < 0.7) {
          // Libros parados y una pila de libros acostados
          books(set, -30, 10, y + 2, -6, 6, maxHeight - 6, maxHeight)
          let top = y + 2
          for (let i = 0; i < 4; i++) top = flatBook(set, 13 + (i % 2) * 2, -4, 28 - (i % 2) * 2, 6, top, pick(set, BOOKS), 2 + (i % 2))
        } else {
          // Libros con un sujetalibros y un florero con una rama seca
          books(set, -30, 4, y + 2, -6, 6, maxHeight - 6, maxHeight)
          set.fill(4, y + 2, -4, 5, y + 9, 4, METAL, flat)
          set.fill(5, y + 2, -4, 8, y + 3, 4, METAL, flat)
          const vase = pick(set, [0x4bacc6, 0xe8e2d4, 0xc0504d])
          const profile = [2.2, 3, 3.6, 3.8, 3.6, 3, 2.4, 1.6, 1.6, 2.1]
          profile.forEach((r, k) => disc(set, 19, 0.5, y + 2 + k, y + 3 + k, r, k === 9 ? shade(vase, -0.15) : vase))
          for (let k = 0; k < 5; k++) set.put(18 + (k > 2 ? 1 : 0), y + 12 + k, 0, BARK, flat)
          set.put(20, y + 16, 0, 0xe8a0a0, flat)
          set.put(17, y + 15, 0, 0xe8a0a0, flat)
        }
      }
      // Arriba, una planta chica si cabe bajo el techo; si no, unos libros acostados
      if (height < 80) {
        disc(set, 20, 0, height, height + 7, 4.4, TERRACOTTA)
        disc(set, 20, 0, height + 7, height + 8, 5, shade(TERRACOTTA, 0.1), undefined, 4)
        disc(set, 20, 0, height + 6, height + 7, 4, SOIL)
        foliage(set, 20, height + 9, 0, 8, 22)
      } else {
        const top = flatBook(set, 10, -4, 26, 6, height, BOOKS[3], 3)
        flatBook(set, 12, -3, 24, 5, top, BOOKS[6], 2)
      }
    },
  },
  {
    id: 'cabinet', name: 'Mueble bajo', category: 'muebles', width: 48, depth: 20,
    colors: { wood: { label: 'Madera', value: 0x8a6a4f }, handles: { label: 'Manillas', value: 0xd9c9a8 } },
    build(set, c) {
      set.fill(-24, 2, -10, 24, 30, 8, c.wood)
      set.fill(-22, 0, -8, 22, 2, 6, shade(c.wood, -0.35))
      set.fill(-26, 30, -10, 26, 32, 12, (x, y, z) => (z === 11 || x === -26 || x === 25 ? shade(c.wood, y === 31 ? -0.04 : -0.14) : shade(c.wood, 0.08)), { jitter: 0.02 })
      // Dos puertas con un panel en relieve y una ranura al medio
      set.fill(-22, 4, 8, 22, 28, 9, (x, y) => {
        const local = x < 0 ? x + 22 : x
        if (x === -1 || x === 0) return shade(c.wood, -0.25)
        const panel = local >= 4 && local <= 17 && y >= 8 && y <= 23
        const edge = panel && (local === 4 || local === 17 || y === 8 || y === 23)
        return edge ? shade(c.wood, -0.08) : panel ? shade(c.wood, 0.08) : shade(c.wood, -0.02)
      })
      set.fill(-3, 13, 9, -2, 19, 10, c.handles, flat)
      set.fill(1, 13, 9, 2, 19, 10, c.handles, flat)
      // Encima: libros parados con un sujetalibros y una pila acostada
      books(set, -21, -7, 32, -6, 6, 8, 12)
      set.fill(-7, 32, -4, -6, 38, 4, METAL, flat)
      set.fill(-6, 32, -4, -4, 33, 4, METAL, flat)
      let top = 32
      for (let i = 0; i < 3; i++) top = flatBook(set, 6 + i * 2, -5, 20 - i, 6, top, pick(set, BOOKS), 3)
    },
  },
  {
    id: 'counter', name: 'Barra de café', category: 'muebles', width: 160, depth: 32, legacy: true,
    colors: { body: { label: 'Mueble', value: 0x5b3d2a }, top: { label: 'Cubierta', value: 0xd9c9a8 }, machine: { label: 'Cafetera', value: 0x9aa0a6 } },
    build(set, c) {
      // El mueble, con paneles al frente, zócalo y una cubierta clara con vetas
      set.fill(-40, 1, -8, 40, 19, 7, c.body)
      set.fill(-39, 0, -7, 39, 1, 6, shade(c.body, -0.35))
      set.fill(-40, 1, 7, 40, 19, 8, (x, y) => {
        const local = (x + 40) % 12
        if (local === 0 || y === 1 || y === 18) return shade(c.body, -0.15)
        return local >= 2 && local <= 10 && y >= 4 && y <= 15 ? shade(c.body, 0.07) : c.body
      })
      set.fill(-41, 19, -9, 41, 20, 9, shade(c.top, -0.15))
      set.fill(-42, 20, -10, 42, 21, 10, (x, _y, z) => (hash(x, z, 9) < 0.05 ? shade(c.top, -0.08) : c.top), flat)

      // La cafetera: cuerpo, bandeja para tazas arriba, dos grupos con sus mangos, manómetro, luz,
      // bandeja de goteo y la lanza de vapor al costado
      const chrome = shade(c.machine, 0.3)
      set.fill(-30, 21, -7, -16, 32, 1, c.machine)
      set.fill(-30, 29, 1, -16, 30, 2, chrome)
      set.fill(-30, 32, -7, -16, 33, 1, (x, _y, z) => ((x + z) % 2 ? METAL : chrome), flat)
      for (const x of [-28, -22]) set.fill(x, 33, -5, x + 2, 35, -3, WHITE)
      for (const x of [-28, -20]) {
        set.fill(x, 24, 1, x + 2, 26, 2, chrome)
        set.fill(x, 24, 2, x + 2, 25, 3, METAL)
        set.fill(x, 24, 3, x + 1, 25, 6, INK, flat)
      }
      set.fill(-24, 25, 1, -21, 28, 2, WHITE, flat)
      set.remove(-24, 25, 1)
      set.remove(-22, 27, 1)
      set.put(-23, 26, 1, INK, flat)
      set.put(-18, 27, 1, 0xff5050, { glow: 1, jitter: 0 })
      set.fill(-30, 21, 1, -16, 22, 4, (x) => (x % 2 ? METAL : chrome), flat)
      set.fill(-28, 22, 1, -26, 24, 3, WHITE)
      set.fill(-15, 23, 0, -14, 29, 1, chrome, flat)
      set.put(-15, 29, 0, INK, flat)

      // El molinillo, con la tolva de granos
      set.fill(-13, 21, -6, -9, 29, -2, 0x3a3a42)
      set.put(-11, 25, -2, chrome, flat)
      set.fill(-13, 29, -6, -9, 33, -2, (_x, y) => (y < 31 ? 0x6b4a33 : 0x8a6347), { jitter: 0.1 })
      set.fill(-13, 33, -6, -9, 34, -2, INK)

      // Tazas sobre sus platillos
      for (const x of [-6, -2, 2]) {
        set.fill(x - 1, 21, -1, x + 2, 22, 2, WHITE)
        set.fill(x, 22, 0, x + 2, 24, 2, WHITE)
        set.put(x + 2, 23, 1, WHITE)
      }

      // La vitrina: abierta al frente, con una torta y medialunas abajo, y cupcakes y galletas arriba
      set.fill(8, 21, -6, 27, 22, 6, shade(c.body, 0.1))
      for (const [x, z] of [[8, -6], [26, -6], [8, 5], [26, 5]]) set.fill(x, 22, z, x + 1, 31, z + 1, METAL)
      const glass = { glow: 0.15, jitter: 0.02 }
      set.fill(9, 22, -6, 26, 31, -5, GLASS, glass)
      set.fill(8, 22, -5, 9, 31, 5, GLASS, glass)
      set.fill(26, 22, -5, 27, 31, 5, GLASS, glass)
      set.fill(8, 31, -6, 27, 32, 6, GLASS, glass)
      set.fill(9, 26, -5, 26, 27, 5, GLASS, { glow: 0.1, jitter: 0.02 })
      disc(set, 14, 0, 22, 25, 3.6, (_x, y) => (y === 23 ? CREAM : 0xe8c07a))
      disc(set, 14, 0, 25, 26, 3.6, 0xe8a0a0)
      set.put(13, 25, 3, 0xc0304d, flat)
      for (const x of [19, 22]) {
        set.fill(x, 22, -1, x + 3, 23, 2, 0xd9a35b)
        set.fill(x + 1, 23, -1, x + 2, 24, 2, 0xc98a4b)
      }
      for (const x of [10, 13, 16]) {
        set.fill(x, 27, 0, x + 2, 28, 2, 0xf2c14e)
        set.fill(x, 28, 0, x + 2, 29, 2, pick(set, [0xffb7b2, CREAM, 0xc7ceea]))
      }
      for (const x of [20, 23]) set.fill(x, 27, -1, x + 2, 28, 2, (px, _y, pz) => ((px + pz) % 3 ? 0xc98a4b : 0x5b3d2a), { jitter: 0.04 })

      // El frasco de galletas, con las galletas a la vista, y su tapa
      set.fill(30, 21, -3, 34, 27, 1, (x, y, z) => (z === 0 && y < 25 && hash(x, y) < 0.6 ? 0xc98a4b : GLASS), { glow: 0.1, jitter: 0.02 })
      set.fill(30, 27, -3, 34, 28, 1, METAL)
      set.fill(31, 28, -2, 33, 29, 0, METAL)
    },
  },
  {
    id: 'fireplace', name: 'Chimenea', category: 'muebles', width: 76, depth: 20,
    colors: { stone: { label: 'Piedra', value: 0x8f8a80 }, mantel: { label: 'Repisa', value: 0x5b3d2a } },
    build(set, c) {
      // Piedras de 7,5 × 22,5 cm corridas en cada fila, cada una de un solo tono (así sus caras se juntan al dibujar)
      const stone = (x: number, y: number, z: number) => {
        const row = Math.floor(y / 4)
        const shifted = x + z + 64 + (row % 2) * 5
        if (y % 4 === 3 || shifted % 10 === 0) return shade(c.stone, -0.3)
        return shade(c.stone, (hash(Math.floor(shifted / 10), row, 4) - 0.5) * 0.2)
      }
      // El cuerpo, con el hueco del fuego tiznado al fondo, y la losa de adelante
      set.fill(-34, 0, -10, 34, 40, 6, stone, flat)
      for (let x = -16; x < 16; x++) for (let y = 2; y < 26; y++) for (let z = -6; z < 6; z++) set.remove(x, y, z)
      set.fill(-16, 2, -7, 16, 26, -6, 0x2a2420, flat)
      set.fill(-16, 1, -6, 16, 2, 6, shade(c.stone, -0.5), flat)
      set.fill(-30, 0, 6, 30, 2, 10, shade(c.stone, -0.18), flat)
      // La repisa de madera con su moldura, y el tiro que sube hasta el techo
      set.fill(-36, 38, -10, 36, 40, 8, shade(c.mantel, -0.18), flat)
      set.fill(-38, 40, -10, 38, 44, 10, (_x, y) => (y === 43 ? shade(c.mantel, 0.08) : c.mantel), flat)
      set.fill(-26, 44, -10, 26, 100, -2, stone, flat)
      // Un cuadro sobre el tiro: un atardecer sobre los cerros
      set.fill(-14, 58, -2, 14, 82, -1, (x, y) => {
        if (y < 64 + Math.round(Math.sin(x * 0.3) * 2)) return 0x3e5c55
        if ((x - 5) ** 2 + (y - 72) ** 2 < 14) return 0xf6e7c1
        return mix(0xe8a87c, 0x6b5b95, (y - 62) / 20)
      }, flat)
      frameRing(set, -14, 58, 14, 82, -2, 0, 0xc9a227, 2)
      // Los leños y las llamas, más altas al medio
      set.fill(-10, 2, -3, 10, 5, 0, BARK)
      set.fill(-8, 2, 1, 8, 5, 4, shade(BARK, -0.15))
      set.fill(-6, 5, -2, 6, 8, 2, BARK)
      for (let x = -8; x < 8; x += 2) {
        const height = 4 + Math.floor(hash(x, 3, 9) * 6) + (4 - Math.abs(x + 1) / 2)
        set.fill(x, 8, -1, x + 2, 8 + Math.floor(height), 1, (_x, y) => (y < 8 + height * 0.4 ? 0xff7a1a : y < 8 + height * 0.75 ? 0xffb347 : 0xffe08a), { glow: 1, jitter: 0 })
      }
      for (const [x, z] of [[-9, 0], [6, 2], [-3, 4]]) set.put(x, 5, z, 0xff7a1a, { glow: 1, jitter: 0 })
      // Sobre la repisa: unos libros y dos candelabros
      books(set, 6, 24, 44, -4, 4, 7, 10)
      for (const x of [-32, -24]) {
        set.fill(x - 1, 44, -1, x + 2, 45, 2, 0xc9a227, flat)
        set.fill(x, 45, 0, x + 1, 52, 1, CREAM, flat)
        set.put(x, 52, 0, 0xffb347, { glow: 1, jitter: 0 })
      }
      return [{ x: 0, y: 14, z: 12, color: 0xff9a4a, intensity: 2, distance: 5.5 }]
    },
  },
  {
    id: 'globe', name: 'Globo terráqueo', category: 'muebles', width: 20, depth: 20,
    colors: { sea: { label: 'Mar', value: 0x4f81bd }, wood: { label: 'Pie', value: 0x74543a } },
    build(set, c) {
      // Un pie de madera, el arco de bronce y el globo: los continentes salen por bloques de 10 cm y los polos, blancos
      disc(set, 0, 0, 0, 2, 6, shade(c.wood, -0.15))
      disc(set, 0, 0, 2, 22, 1.5, c.wood)
      disc(set, 0, 0, 22, 24, 4, shade(c.wood, 0.1))
      for (let x = -9; x < 9; x++)
        for (let y = -9; y < 9; y++)
          for (let z = -9; z < 9; z++) {
            const d = (x + 0.5) ** 2 + (y + 0.5) ** 2 + (z + 0.5) ** 2
            if (d <= 64) set.put(x, y + 33, z, Math.abs(y + 0.5) > 6.5 ? WHITE : hash((x + 16) >> 2, (y + 16) >> 2, (z + 16) >> 2) < 0.42 ? 0x6fa36f : c.sea, flat)
            else if (z === 0 && x < 2 && d > 81 && d <= 100) set.put(x, y + 33, z, 0xc9a227, flat)
          }
      set.fill(-1, 42, -1, 1, 44, 1, 0xc9a227, flat)
    },
  },
  {
    id: 'waterCooler', name: 'Dispensador de agua', category: 'muebles', width: 14, depth: 14,
    colors: { body: { label: 'Mueble', value: 0xf4f4f0 } },
    build(set, c) {
      // El mueble con el nicho de las dos llaves y su bandeja, y arriba el bidón
      set.fill(-6, 0, -6, 6, 2, 6, shade(c.body, -0.35), flat)
      set.fill(-7, 2, -7, 7, 40, 7, c.body, flat)
      for (let x = -5; x < 5; x++) for (let y = 24; y < 34; y++) for (let z = 4; z < 7; z++) set.remove(x, y, z)
      set.fill(-5, 24, 3, 5, 34, 4, shade(c.body, -0.22), flat)
      set.fill(-5, 24, 4, 5, 25, 7, METAL, flat)
      set.fill(-3, 31, 4, -2, 33, 5, 0x4f81bd, flat)
      set.fill(2, 31, 4, 3, 33, 5, 0xc0504d, flat)
      disc(set, 0, 0, 40, 42, 3, shade(c.body, -0.12), flat)
      disc(set, 0, 0, 42, 58, 5.6, (_x, y) => (y < 53 ? 0x7fb8e6 : 0xbfe0f5), { glow: 0.15, jitter: 0 })
      disc(set, 0, 0, 58, 59, 4.4, 0xbfe0f5, { glow: 0.15, jitter: 0 })
    },
  },
  {
    id: 'guitar', name: 'Guitarra', category: 'muebles', width: 16, depth: 8,
    colors: { body: { label: 'Caja', value: 0xd9822b } },
    build(set, c) {
      // Parada contra la pared: la caja en dos curvas, la boca, el puente, el mástil con sus trastes y el clavijero
      const edge = shade(c.body, -0.3)
      for (let x = -7; x < 7; x++)
        for (let y = 0; y < 26; y++) {
          const low = (x + 0.5) ** 2 + (y + 0.5 - 9) ** 2
          const high = (x + 0.5) ** 2 + (y + 0.5 - 19) ** 2
          if (low > 49 && high > 25) continue
          const rim = low > 36 && high > 16
          set.fill(x, y, -4, x + 1, y + 1, -1, rim ? edge : c.body, flat)
          if (!rim && (x + 0.5) ** 2 + (y + 0.5 - 15) ** 2 < 4.5) set.put(x, y, -1, INK, flat)
        }
      set.fill(-3, 7, -1, 3, 8, 0, 0x3a2a1e, flat)
      set.fill(-1, 26, -3, 1, 46, -1, 0x5b3d2a, flat)
      for (let y = 28; y < 46; y += 3) set.fill(-1, y, -1, 1, y + 1, 0, 0xc9ccd2, flat)
      set.fill(-2, 46, -3, 2, 52, -1, 0x3a2a1e, flat)
      for (const y of [47, 49, 51]) for (const x of [-3, 2]) set.put(x, y, -2, 0xc9ccd2, flat)
    },
  },
  {
    id: 'coatRack', name: 'Perchero', category: 'muebles', width: 20, depth: 20,
    colors: { wood: { label: 'Madera', value: 0x5b3d2a }, coat: { label: 'Chaqueta', value: 0x4f5d8a }, scarf: { label: 'Bufanda', value: 0xc0504d } },
    build(set, c) {
      // El pie en cruz, el poste, cuatro ganchos arriba con un gorro, una chaqueta colgando y una bufanda a rayas
      set.fill(-8, 0, -1, 8, 2, 1, c.wood)
      set.fill(-1, 0, -8, 1, 2, 8, c.wood)
      set.fill(-1, 2, -1, 1, 70, 1, c.wood)
      disc(set, 0, 0, 70, 72, 2, shade(c.wood, 0.1))
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k < 5; k++) set.put(dx * k, 64 + (k > 2 ? 1 : 0), dz * k, c.wood, flat)
      disc(set, 0, 0, 72, 75, 4, 0x3a3a42)
      disc(set, 0, 0, 72, 73, 5.5, 0x3a3a42)
      // La chaqueta: hombros en el gancho de adelante y el cuerpo cayendo, con la abertura y dos botones
      set.fill(-4, 40, 2, 5, 64, 6, (_x, y) => (y < 44 ? shade(c.coat, -0.15) : c.coat))
      set.fill(-6, 44, 2, -4, 62, 5, shade(c.coat, -0.08))
      set.fill(5, 44, 2, 7, 62, 5, shade(c.coat, -0.08))
      set.fill(0, 40, 6, 1, 62, 7, shade(c.coat, -0.3), flat)
      for (const y of [50, 56]) set.put(1, y, 6, 0xd9c9a8, flat)
      // La bufanda en el gancho del costado, con flecos
      set.fill(-6, 42, -1, -4, 66, 1, (_x, y) => ((y >> 2) % 2 ? c.scarf : CREAM))
      for (const z of [-1, 0]) set.put(-6 + (z + 1), 41, z, CREAM, flat)
    },
  },
  {
    id: 'radio', name: 'Radio antigua', category: 'muebles', width: 18, depth: 10, y: ON_TABLE,
    colors: { wood: { label: 'Madera', value: 0x8a5a3c } },
    build(set, c) {
      // Una caja de madera con la parte de arriba redondeada, el parlante en tela, el dial encendido, dos perillas y la antena
      set.fill(-9, 0, -4, 9, 10, 4, c.wood)
      set.fill(-8, 10, -4, 8, 12, 4, c.wood)
      set.fill(-6, 12, -4, 6, 13, 4, c.wood)
      set.fill(-7, 3, 4, 1, 10, 5, (x, y) => ((x + y) % 2 ? 0xd9c9a8 : 0xc9b48f), flat)
      set.fill(3, 7, 4, 8, 10, 5, 0xffd27f, { glow: 0.8, jitter: 0 })
      set.put(5, 8, 5, 0xc0304d, flat)
      for (const x of [3, 6]) set.fill(x, 2, 4, x + 2, 4, 6, 0xd9c9a8, flat)
      for (let k = 0; k < 10; k++) set.put(6 + Math.floor(k / 3), 13 + k, -2, 0xc9ccd2, flat)
    },
  },
  {
    id: 'cat', name: 'Gato durmiendo', category: 'muebles', width: 16, depth: 16,
    colors: { fur: { label: 'Pelaje', value: 0xd9822b }, bed: { label: 'Cojín', value: 0x7f8cc4 } },
    build(set, c) {
      // Un cojín redondo con borde, y el gato enrollado encima: lomo a rayas, la cabeza con orejas y la cola alrededor
      disc(set, 0, 0, 0, 2, 7.6, c.bed)
      disc(set, 0, 0, 2, 4, 7.6, shade(c.bed, -0.12), undefined, 6)
      for (let x = -6; x < 6; x++)
        for (let y = 2; y < 9; y++)
          for (let z = -5; z < 5; z++)
            if (((x + 0.5) / 5.5) ** 2 + ((y - 2) / 6) ** 2 + ((z + 0.5 + 0.5) / 4.2) ** 2 <= 1) set.put(x, y, z, (x >> 1) % 2 ? shade(c.fur, -0.2) : c.fur, flat)
      disc(set, 3.5, 2.5, 3, 7, 2.8, c.fur, flat)
      for (const x of [2, 5]) set.put(x, 7, 2, shade(c.fur, -0.25), flat)
      set.fill(2, 5, 5, 6, 6, 6, INK, flat) // los ojos cerrados: una línea
      set.put(3, 4, 5, 0xe8a0a0, flat)
      for (let t = 0; t < 10; t++) set.put(-5 + t, 3, 4 + (t > 2 && t < 8 ? 1 : 0), t > 7 ? CREAM : shade(c.fur, -0.1), flat)
    },
  },
  {
    id: 'books', name: 'Libros apilados', category: 'muebles', width: 12, depth: 12, y: ON_TABLE,
    colors: {},
    build(set) {
      let y = flatBook(set, -6, -4, 6, 6, 0, BOOKS[1], 5)
      y = flatBook(set, -4, -6, 4, 4, y, BOOKS[0], 4)
      y = flatBook(set, -6, -2, 4, 4, y, BOOKS[2], 4)
      // Un marcador que asoma del de arriba
      set.fill(-1, y - 3, 4, 0, y - 1, 5, 0xc0304d, flat)
    },
  },
  {
    id: 'notebook', name: 'Cuaderno abierto', category: 'muebles', width: 24, depth: 16, y: ON_TABLE,
    colors: { cover: { label: 'Tapa', value: 0x3e5c55 } },
    build(set, c) {
      // La tapa abajo, dos páginas con líneas y margen, un espiral al medio y un lápiz encima
      set.fill(-11, 0, -8, 11, 1, 8, c.cover)
      set.fill(-10, 1, -7, 10, 2, 7, (x, _y, z) => {
        if (x === -1 || x === 0) return shade(PAGES, -0.15)
        if (x === -8 || x === 2) return 0xe8a0a0
        return (z + 7) % 2 === 1 ? 0xc9d6e8 : WHITE
      }, flat)
      for (let z = -6; z < 7; z += 2) set.fill(-1, 2, z, 1, 3, z + 1, 0x9aa0a6, flat)
      // Lo escrito: unas líneas a mano en la página izquierda y un par en la derecha
      for (const z of [-6, -4, -2, 0, 2]) scribble(set, -7, -2, 1, z, 0x2f4a8a)
      for (const z of [-6, -4]) scribble(set, 3, 9, 1, z, 0x2f4a8a)
      for (let t = 0; t < 8; t++) set.put(3 + t, 2, 5 - Math.round(t * 0.6), t === 0 ? INK : t === 1 ? 0xe8c07a : t === 7 ? 0xe8a0a0 : 0xf2c14e, flat)
    },
  },
  {
    id: 'energyCan', name: 'Lata energética', category: 'muebles', width: 4, depth: 4, y: ON_TABLE,
    colors: { can: { label: 'Lata', value: 0xf4f4f0 }, stripe: { label: 'Diseño', value: 0x7fd3e0 } },
    build(set, c) {
      // Una lata blanca de 500 ml (7 × 17 cm): base y tapa de aluminio, el diseño en franjas y la anilla
      const aluminum = 0xc9ccd2
      set.fill(-1, 0, -1, 2, 1, 2, aluminum)
      set.fill(-1, 1, -1, 2, 7, 2, (x, y, z) => {
        if ((x + z + y) % 4 === 0 && y >= 2 && y <= 5) return c.stripe
        if (y === 6) return shade(c.can, -0.06)
        return c.can
      }, flat)
      set.fill(-1, 7, -1, 2, 8, 2, aluminum)
      set.put(0, 7, 0, shade(aluminum, -0.25), flat)
      set.put(0, 8, 1, shade(aluminum, 0.15), flat)
    },
  },
  {
    id: 'coffee', name: 'Taza de café', category: 'muebles', width: 8, depth: 6, y: ON_TABLE,
    colors: { mug: { label: 'Taza', value: 0xe8e2d4 } },
    build(set, c) {
      // Un platillo, la taza con su asa, el café adentro y un poco de vapor
      set.fill(-2, 0, -2, 3, 1, 3, shade(c.mug, 0.06))
      set.fill(-1, 1, -1, 2, 5, 2, c.mug)
      set.put(0, 4, 0, 0x5b3a26, flat)
      set.put(2, 2, 0, c.mug)
      set.put(3, 2, 0, c.mug)
      set.put(3, 3, 0, c.mug)
      set.put(2, 4, 0, c.mug)
      set.put(3, 4, 0, c.mug)
      for (const [x, y] of [[0, 6], [1, 8]]) set.put(x, y, 0, 0xf0f0f0, { glow: 0.2, jitter: 0 })
    },
  },

  // ─── En la pared ───
  {
    id: 'window', name: 'Ventana', category: 'pared', width: 96, depth: 8, onWall: true, y: 32,
    colors: { frame: { label: 'Marco', value: 0xe8e4da }, curtain: { label: 'Cortinas', value: 0xb5654a } },
    // El clima se mueve (windowWeather.ts): las nubes y estrellas que se mueven reemplazan a las fijas
    options: { sky: { label: 'Cielo', values: ['tarde', 'dia', 'noche'] }, curtains: { label: 'Cortinas', values: ['no', 'si'] }, weather: { label: 'Clima', values: ['nada', 'lluvia', 'nieve', 'nubes', 'estrellas'] } },
    build(set, c, o) {
      const [low, mid, top] = SKIES[o.sky] ?? SKIES.tarde
      const h = 52
      const paint = (x: number, y: number, color: number, glow = 0.6) => {
        if (x >= -48 && x < 48 && y >= 0 && y < h) set.put(x, y, -4, color, { glow, jitter: 0 })
      }
      const blob = (cx: number, cy: number, rx: number, ry: number, color: number, glow: number) => {
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
          for (let y = Math.floor(cy - ry); y <= cy + ry; y++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) paint(x, y, color, glow)
      }
      for (let y = 0; y < h; y++) {
        const t = y / (h - 1)
        set.fill(-48, y, -4, 48, y + 1, -3, t < 0.5 ? mix(low, mid, t * 2) : mix(mid, top, (t - 0.5) * 2), { glow: 0.6, jitter: 0 })
      }
      if (o.sky === 'noche') {
        // Estrellas, una luna en cuarto creciente y la ciudad con sus ventanas encendidas
        // Los números al azar se sacan igual sin pintar, para que la ciudad salga igual con o sin estrellas que titilan
        for (let i = 0; i < 40; i++) {
          const star = [-47 + Math.floor(set.next() * 94), 24 + Math.floor(set.next() * 27), set.next() < 0.5 ? 1 : 0.7]
          if (o.weather !== 'estrellas') paint(star[0], star[1], 0xfff4cf, star[2])
        }
        for (const [x, y] of [[-32, 42], [10, 46]]) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) paint(x + dx, y + dy, 0xfff4cf, 1)
        blob(24, 36, 6.4, 6.4, 0xf6f1d8, 1)
        blob(27.2, 38, 5.2, 5.2, mix(mid, top, 0.4), 0.6)
        let x = -48
        while (x < 48) {
          const w = 6 + Math.floor(set.next() * 8)
          const height = 6 + Math.floor(set.next() * 16)
          for (let bx = x; bx < x + w; bx++)
            for (let y = 0; y < height; y++) {
              const lit = bx > x && bx < x + w - 1 && y > 0 && y < height - 2 && bx % 2 === 0 && y % 3 === 1 && set.next() < 0.5
              paint(bx, y, lit ? 0xffd27f : y === height - 1 ? 0x232845 : 0x161a33, lit ? 1 : 0.4)
            }
          x += w
        }
      } else {
        const day = o.sky === 'dia'
        if (day) blob(22, 36, 5.2, 5.2, 0xfff4cf, 1)
        else blob(16, 14, 7.2, 7.2, 0xffc06a, 1)
        // Nubes
        for (const [cx, cy, rx] of o.weather === 'nubes' ? [] : day ? [[-28, 40, 8], [-20, 42, 6], [4, 46, 8], [34, 28, 6]] : [[-24, 34, 12], [8, 42, 10], [28, 30, 8]]) {
          blob(cx, cy, rx, day ? 3.2 : 1.6, day ? 0xffffff : 0xf2b8a0, day ? 0.8 : 0.7)
        }
        // Cerros lejanos, cerros cercanos y unos árboles
        const far = day ? 0x9cc7a4 : 0x6b5b95
        const near = day ? 0x6fa36f : 0x3e4a6b
        for (let x = -48; x < 48; x++) {
          const farTop = Math.round(14 + Math.sin(x * 0.09 + 1) * 5)
          for (let y = 0; y < farTop; y++) paint(x, y, far, 0.4)
          const nearTop = Math.round(6 + Math.sin(x * 0.15) * 3.2)
          for (let y = 0; y < nearTop; y++) paint(x, y, near, 0.3)
        }
        for (const tx of [-38, -16, 12, 36]) {
          const base = Math.round(6 + Math.sin(tx * 0.15) * 3.2)
          for (let y = base; y < base + 3; y++) paint(tx, y, 0x5b3d2a, 0.3)
          blob(tx, base + 6, 3.2, 4.4, day ? 0x4f8a4f : 0x2b3352, 0.3)
        }
      }
      // El marco con su moldura, el parteluz, el travesaño y el alféizar
      frameRing(set, -48, 0, 48, h, -4, 0, c.frame, 3)
      frameRing(set, -51, -3, 51, h + 3, -4, -2, shade(c.frame, -0.08), 1)
      set.fill(-1, 0, -3, 1, h, -1, c.frame)
      set.fill(-48, 34, -3, 48, 36, -1, c.frame)
      set.fill(-54, -6, -4, 54, -4, 4, (_x, y, z) => (z === 3 && y === -5 ? shade(c.frame, -0.1) : c.frame))
      set.fill(-50, -10, -4, 50, -6, -2, shade(c.frame, -0.12))
      if (o.curtains === 'si') {
        // Cortinas con pliegues, amarradas a media altura, y la barra con sus remates
        for (const [x0, x1] of [[-64, -48], [48, 64]]) {
          for (let x = x0; x < x1; x++) {
            const fold = Math.floor(x / 2) % 2 === 0
            set.fill(x, -8, -2, x + 1, h + 8, fold ? 2 : 0, fold ? c.curtain : shade(c.curtain, -0.16))
          }
          set.fill(x0, 18, -2, x1, 20, 3, shade(c.curtain, 0.3))
        }
        set.fill(-68, h + 8, 0, 68, h + 9, 1, METAL)
        for (const x of [-70, 68]) set.fill(x, h + 7, -1, x + 2, h + 10, 2, 0xc9a227)
      }
    },
  },
  {
    id: 'whiteboard', name: 'Pizarra blanca', category: 'pared', width: 112, depth: 8, onWall: true, y: 36,
    colors: { frame: { label: 'Marco', value: 0x9aa0a6 } },
    build(set, c) {
      set.fill(-54, 2, -4, 54, 46, -3, WHITE, flat)
      frameRing(set, -54, 2, 54, 46, -4, -2, c.frame, 2)
      // Escrito con plumón: un título subrayado, unas líneas y un gráfico de barras
      const ink = [0x4f81bd, 0xc0504d, 0x2f3b33]
      set.fill(-48, 40, -4, -24, 42, -3, ink[0], flat)
      set.fill(-48, 37, -4, -18, 38, -3, ink[1], flat)
      for (let i = 0; i < 8; i++) scribble(set, -48, -8 - Math.floor(set.next() * 12), 32 - i * 3, -4, ink[i % 3])
      set.fill(8, 8, -4, 9, 40, -3, ink[2], flat)
      set.fill(8, 8, -4, 48, 9, -3, ink[2], flat)
      for (const [x, height, color] of [[14, 12, ink[1]], [22, 20, ink[0]], [30, 16, 0x3a7a48], [38, 26, ink[1]]]) set.fill(x, 9, -4, x + 4, 9 + height, -3, color, flat)
      // La bandeja con plumones y el borrador
      set.fill(-36, 0, -4, 36, 2, 2, c.frame)
      for (const [x, color] of [[-28, ink[0]], [-18, ink[1]], [-8, ink[2]]]) {
        set.fill(x, 2, -1, x + 6, 3, 1, WHITE, flat)
        set.fill(x + 6, 2, -1, x + 8, 3, 1, color, flat)
      }
      set.fill(12, 2, -2, 22, 4, 1, 0x9a9aa0)
      set.fill(12, 4, -2, 22, 5, 1, METAL)
    },
  },
  {
    id: 'chalkboard', name: 'Pizarra de tiza', category: 'pared', width: 96, depth: 8, onWall: true, y: 60,
    colors: { frame: { label: 'Marco', value: 0x6b4a33 } },
    build(set, c) {
      set.fill(-44, 4, -4, 44, 36, -3, 0x2f3b33, { jitter: 0.03 })
      frameRing(set, -44, 4, 44, 36, -4, -2, shade(c.frame, 0.12), 2)
      frameRing(set, -46, 2, 46, 38, -4, -1, c.frame, 2)
      // El menú escrito con tiza, con precios y una taza dibujada con su vapor
      const chalk = [WHITE, 0xf2c14e, 0xe8a0a0]
      const dusty = { jitter: 0.05 }
      set.fill(-36, 30, -4, -12, 32, -3, chalk[0], dusty)
      for (let i = 0; i < 6; i++) {
        scribble(set, -36, -6, 25 - i * 4, -4, chalk[0])
        set.fill(0, 25 - i * 4, -4, 4, 26 - i * 4, -3, chalk[1], dusty)
      }
      for (let y = 9; y < 21; y++) {
        set.put(18, y, -4, chalk[0], dusty)
        set.put(32, y, -4, chalk[0], dusty)
      }
      set.fill(18, 8, -4, 33, 9, -3, chalk[0], dusty)
      set.fill(33, 12, -4, 36, 13, -3, chalk[0], dusty)
      set.fill(35, 12, -4, 36, 18, -3, chalk[0], dusty)
      set.fill(32, 17, -4, 36, 18, -3, chalk[0], dusty)
      for (const x of [22, 27]) for (let y = 23; y < 31; y++) set.put(x + ((y >> 1) % 2), y, -4, chalk[2], dusty)
      // La repisa de la tiza, con dos tizas
      set.fill(-28, 0, -4, 28, 2, 2, c.frame)
      set.fill(-20, 2, -1, -14, 3, 1, WHITE, flat)
      set.fill(-8, 2, -1, -4, 3, 1, 0xf2c14e, flat)
    },
  },
  {
    id: 'corkboard', name: 'Diario mural', category: 'pared', width: 64, depth: 4, onWall: true, y: 40,
    colors: { frame: { label: 'Marco', value: 0x8a6a4f } },
    build(set, c) {
      set.fill(-30, 2, -2, 30, 38, -1, 0xc49a6c, { jitter: 0.1 })
      frameRing(set, -30, 2, 30, 38, -2, 0, c.frame, 2)
      // Notas con líneas escritas y un alfiler, y una foto
      const notes = [0xfff1a8, 0xa8e6cf, 0xffb7b2, 0xc7ceea, WHITE]
      const pins = [0xc0504d, 0x4f81bd, 0xf2c14e, 0x3a7a48]
      const spots = [[-27, 22], [-13, 24], [1, 22], [-25, 6], [-9, 8], [18, 5]]
      spots.forEach(([x, y], i) => {
        const w = 10 + Math.floor(set.next() * 3)
        const color = notes[i % notes.length]
        set.fill(x, y, -1, x + w, y + 10, 0, color, { jitter: 0.02 })
        for (let row = y + 2; row < y + 8; row += 2) set.fill(x + 2, row, -1, x + 3 + Math.floor(set.next() * (w - 4)), row + 1, 0, shade(color, -0.35), flat)
        set.put(x + Math.floor(w / 2), y + 8, 0, pins[i % pins.length], flat)
      })
      set.fill(16, 19, -1, 28, 35, 0, WHITE, flat)
      set.fill(18, 26, -1, 26, 33, 0, 0x8ec5ff, flat)
      set.fill(18, 21, -1, 26, 26, 0, 0x6fa36f, flat)
      set.fill(22, 30, -1, 24, 32, 0, 0xf2c14e, flat)
    },
  },
  {
    id: 'kanban', name: 'Tablero de tareas', category: 'pared', width: 80, depth: 4, onWall: true, y: 40,
    colors: { frame: { label: 'Marco', value: 0x3c3f4a } },
    build(set, c) {
      // Un tablero blanco con tres columnas (por hacer, haciendo, listo): cada una con su título y sus notas pegadas
      set.fill(-38, 2, -2, 38, 42, -1, WHITE, flat)
      frameRing(set, -38, 2, 38, 42, -2, 0, c.frame, 2)
      const notes = [0xfff1a8, 0xa8e6cf, 0xffb7b2, 0xc7ceea, 0xffd6a5]
      for (const [column, title, count] of [[0, 0xc0504d, 5], [1, 0xf2c14e, 3], [2, 0x3a7a48, 2]]) {
        const x = -35 + column * 25
        if (column > 0) set.fill(x - 3, 4, -1, x - 2, 40, 0, 0xc9ccd2, flat)
        set.fill(x, 37, -1, x + 14, 39, 0, title, flat)
        for (let i = 0; i < count; i++) {
          const nx = x + (i % 2) * 11
          const ny = 26 - Math.floor(i / 2) * 11
          const color = pick(set, notes)
          set.fill(nx, ny, -1, nx + 9, ny + 9, 0, color, flat)
          set.fill(nx + 2, ny + 5, -1, nx + 7, ny + 6, 0, shade(color, -0.35), flat)
          set.fill(nx + 2, ny + 3, -1, nx + 5, ny + 4, 0, shade(color, -0.35), flat)
        }
      }
    },
  },
  {
    id: 'tvScreen', name: 'Pantalla', category: 'pared', width: 68, depth: 4, onWall: true, y: 48,
    colors: { frame: { label: 'Marco', value: 0x1a1a1e } },
    build(set, c) {
      // Una pantalla colgada con una presentación: el título, un gráfico de barras y uno de torta
      const bars = [8, 12, 7, 16, 19]
      set.fill(-34, 0, -2, 34, 40, 0, c.frame, flat)
      frameRing(set, -32, 2, 32, 38, 0, 1, c.frame, 2)
      set.fill(-32, 2, 0, 32, 38, 1, (x, y) => {
        if (y >= 32 && y < 35 && x >= -28 && x < -2) return WHITE
        if (y === 29 && x >= -28 && x < 4) return 0x9fb4d8
        if (y === 5 && x >= -29 && x < 3) return 0x9fb4d8
        const bar = Math.floor((x + 28) / 6)
        if (x >= -28 && x < 2 && (x + 28) % 6 < 4 && y >= 6 && y < 8 + bars[bar]) return bar === 4 ? 0xf2c14e : 0x5aa0e6
        const d = (x - 17.5) ** 2 + (y - 16.5) ** 2
        if (d < 90 && d > 20) return Math.atan2(y - 16.5, x - 17.5) > 0.6 ? 0xf2c14e : x < 17 ? 0x5aa0e6 : 0x7fd3a0
        return 0x1f2a44
      }, { glow: 0.8, jitter: 0 })
      set.put(30, 1, 0, 0x7fd3a0, { glow: 1, jitter: 0 })
      return [{ x: 0, y: 20, z: 6, color: 0x8fb4ff, intensity: 0.5, distance: 3 }]
    },
  },
  {
    id: 'trellis', name: 'Enrejado con enredadera', category: 'pared', width: 48, depth: 4, onWall: true, y: 0,
    colors: { wood: { label: 'Listones', value: 0xe8e4da }, flower: { label: 'Flores', value: 0xe8738f } },
    build(set, c) {
      // Listones cruzados cada 20 cm, y cinco guías que suben con sus hojas y algunas flores
      for (let x = -24; x < 24; x += 8) set.fill(x, 0, -2, x + 2, 84, -1, c.wood, flat)
      set.fill(22, 0, -2, 24, 84, -1, c.wood, flat)
      for (let y = 6; y < 84; y += 8) set.fill(-24, y, -1, 24, y + 2, 0, shade(c.wood, -0.08), flat)
      for (let i = 0; i < 5; i++) {
        let x = -20 + i * 10
        const top = 50 + Math.floor(set.next() * 32)
        for (let y = 0; y < top; y++) {
          if (y % 6 === 5) x = Math.max(-22, Math.min(21, x + (set.next() < 0.5 ? -1 : 1)))
          set.put(x, y, 0, STEM, { jitter: 0.06 })
          if (y % 3 === 1) {
            const lx = set.next() < 0.5 ? x - 2 : x + 1
            set.fill(lx, y, 0, lx + 2, y + 2, 1, pick(set, [LEAF, LEAF_DARK, LEAF_LIGHT]), { jitter: 0.06 })
          }
          if (set.next() < 0.07) set.put(x, y, 1, c.flower, flat)
        }
      }
    },
  },
  {
    id: 'calendar', name: 'Calendario', category: 'pared', width: 24, depth: 2, onWall: true, y: 44,
    colors: { header: { label: 'Encabezado', value: 0xc0504d } },
    build(set, c) {
      // La hoja del mes colgada de un clavo: el encabezado, las 5 semanas de 7 días y algunos días marcados
      set.fill(-11, 0, -1, 11, 26, 0, WHITE, flat)
      set.fill(-11, 20, -1, 11, 26, 0, c.header, flat)
      set.fill(-6, 22, 0, 6, 24, 1, WHITE, flat)
      for (let row = 0; row < 5; row++)
        for (let day = 0; day < 7; day++) {
          const x = -10 + day * 3
          const y = 16 - row * 3
          const marked = (row * 7 + day) % 9 === 4
          set.fill(x, y, 0, x + 2, y + 2, 1, marked ? c.header : day > 4 ? 0xc9ccd2 : 0xe8e2d4, flat)
        }
      set.put(0, 27, -1, METAL, flat)
    },
  },
  {
    id: 'clock', name: 'Reloj', category: 'pared', width: 20, depth: 4, onWall: true, y: 76,
    colors: { rim: { label: 'Borde', value: 0x2f2f36 } },
    build(set, c) {
      for (let x = -10; x < 10; x++)
        for (let y = 0; y < 20; y++) {
          const d = (x + 0.5) ** 2 + (y + 0.5 - 10) ** 2
          if (d > 100) continue
          if (d >= 72) set.fill(x, y, -2, x + 1, y + 1, 0, c.rim, flat)
          else set.put(x, y, -2, WHITE, flat)
        }
      // Las doce marcas, las agujas y el segundero
      for (let k = 0; k < 12; k++) {
        const angle = (k / 12) * Math.PI * 2
        set.put(Math.floor(Math.cos(angle) * 7), Math.floor(10 + Math.sin(angle) * 7), -1, k % 3 === 0 ? METAL : 0x9aa0a6, flat)
      }
      for (let t = 0; t < 7; t++) set.put(0, 10 + t, -1, METAL, flat)
      for (let t = 0; t < 5; t++) set.put(Math.round(t * 0.87), Math.round(10 - t * 0.5), -1, METAL, flat)
      for (let t = 1; t < 7; t++) set.put(Math.round(-t * 0.5), Math.round(10 - t * 0.87), -1, 0xc0504d, flat)
      set.put(0, 10, -1, 0xc0504d, flat)
    },
  },
  {
    id: 'poster', name: 'Afiche', category: 'pared', width: 36, depth: 4, onWall: true, y: 44,
    colors: { sky: { label: 'Fondo', value: 0x89b4fa }, hill: { label: 'Cerro', value: 0x3a7a48 }, sun: { label: 'Sol', value: 0xf2a65a } },
    build(set, c) {
      // Un paisaje: cielo, sol, una montaña con nieve y un cerro con un camino, con su paspartú y un marco fino
      for (let x = -14; x < 14; x++)
        for (let y = 4; y < 40; y++) {
          const peak = 30 - Math.abs(x + 5) * 1.3
          const hill = 14 - Math.abs(x + 1) * 0.35
          let color = mix(c.sky, 0xffffff, (40 - y) / 60)
          if ((x - 5) ** 2 + (y - 30) ** 2 <= 26) color = c.sun
          if (y < peak) color = y > peak - 5 ? WHITE : mix(c.hill, c.sky, 0.45)
          if (y < hill) color = Math.abs(x + 1 - (y - 4) * 0.6) < 1.2 ? 0xd9c9a8 : c.hill
          set.put(x, y, -2, color, { jitter: 0.02 })
        }
      frameRing(set, -14, 4, 14, 40, -2, -1, CREAM, 2)
      frameRing(set, -16, 2, 16, 42, -2, 0, METAL, 1)
    },
  },
  {
    id: 'stringLights', name: 'Guirnalda de luces', category: 'luces', width: 120, depth: 4, onWall: true, y: 80,
    colors: { bulbs: { label: 'Luces', value: 0xffd27f } },
    build(set, c) {
      // Dos tramos que cuelgan entre tres ganchos, con una ampolleta cada 20 cm
      for (let x = -60; x < 60; x++) {
        const t = ((x + 60) % 60) / 60
        const y = -Math.round(Math.sin(t * Math.PI) * 8)
        set.put(x, y, 0, METAL, flat)
        if ((x + 60) % 8 === 4) {
          set.put(x, y - 1, 0, INK, flat)
          set.fill(x, y - 3, 0, x + 1, y - 1, 1, (x + 60) % 16 === 4 ? c.bulbs : shade(c.bulbs, 0.25), { glow: 1, jitter: 0.03 })
        }
      }
      for (const x of [-60, 0, 59]) set.fill(x, 0, -2, x + 1, 3, 0, METAL, flat)
      return [
        { x: -30, y: -10, z: 2, color: c.bulbs, intensity: 0.4, distance: 3 },
        { x: 30, y: -10, z: 2, color: c.bulbs, intensity: 0.4, distance: 3 },
      ]
    },
  },
  {
    id: 'shelfWall', name: 'Repisa', category: 'pared', width: 56, depth: 12, onWall: true, y: 56,
    colors: { wood: { label: 'Madera', value: 0x74543a } },
    build(set, c) {
      set.fill(-28, 0, -6, 28, 2, 6, (_x, _y, z) => (z === 5 ? shade(c.wood, -0.12) : c.wood))
      // Dos escuadras de fierro abajo, con su diagonal
      for (const x of [-20, 18]) {
        for (let k = 0; k < 8; k++) {
          set.put(x, -1 - k, -6, METAL, flat)
          set.put(x, -1, -6 + k, METAL, flat)
        }
        for (let k = 0; k < 6; k++) set.put(x, -7 + k, -6 + k, METAL, flat)
      }
      books(set, -26, -4, 2, -4, 4, 8, 12)
      set.fill(-4, 2, -4, -3, 8, 4, METAL, flat)
      disc(set, 8, 0, 2, 8, 3.6, TERRACOTTA)
      disc(set, 8, 0, 7, 8, 2.6, SOIL)
      foliage(set, 8, 10, 0, 7, 16)
      // Una foto en su marco, apoyada atrás
      set.fill(16, 2, -5, 26, 14, -3, 0x3a2a1e)
      set.fill(17, 3, -3, 25, 13, -2, 0x8ec5ff, flat)
      set.fill(17, 3, -3, 25, 6, -2, 0x6fa36f, flat)
      set.fill(21, 9, -3, 23, 11, -2, 0xf2c14e, flat)
    },
  },

  // ─── Luces ───
  {
    id: 'floorLamp', name: 'Lámpara de pie', category: 'luces', width: 28, depth: 28,
    colors: { shade: { label: 'Pantalla', value: 0xf6e7c1 }, pole: { label: 'Pie', value: 0x2f2f36 } },
    build(set, c) {
      disc(set, 0.5, 0.5, 0, 1, 8, c.pole)
      disc(set, 0.5, 0.5, 1, 2, 6, shade(c.pole, 0.1))
      disc(set, 0.5, 0.5, 2, 3, 3, shade(c.pole, 0.15))
      set.fill(0, 3, 0, 1, 62, 1, c.pole)
      disc(set, 0.5, 0.5, 36, 37, 1.5, 0xc9a227, flat)
      // La pantalla: un cono hueco, más ancho abajo, con dos ribetes y la ampolleta adentro
      for (let y = 60; y < 80; y++) {
        const r = 12 - ((y - 60) / 19) * 4
        const color = y === 60 || y === 79 ? shade(c.shade, -0.14) : y === 62 || y === 77 ? shade(c.shade, -0.06) : c.shade
        disc(set, 0.5, 0.5, y, y + 1, r, color, { glow: 0.7, jitter: 0.02 }, y === 79 ? 0 : r - 1.4)
      }
      disc(set, 0.5, 0.5, 62, 66, 1.5, 0xfff4cf, { glow: 1, jitter: 0 })
      return [{ x: 0, y: 64, z: 0, color: 0xffd59a, intensity: 2.2, distance: 6 }]
    },
  },
  {
    id: 'tableLamp', name: 'Lámpara de mesa', category: 'luces', width: 16, depth: 12, y: ON_TABLE,
    colors: { shade: { label: 'Pantalla', value: 0x2f7a4f }, base: { label: 'Base', value: 0xc9a227 } },
    build(set, c) {
      // Lámpara de banquero: base de bronce, cuello fino, pantalla curva con la ampolleta abajo y su cadenita
      set.fill(-6, 0, -4, 6, 2, 4, c.base)
      for (const [x, z] of [[-6, -4], [5, -4], [-6, 3], [5, 3]]) set.remove(x, 1, z)
      set.fill(-2, 2, -2, 2, 3, 2, shade(c.base, 0.1))
      set.fill(0, 3, 0, 1, 14, 1, c.base)
      for (let z = -6; z < 6; z++)
        for (let y = 13; y < 20; y++) {
          if (((z + 0.5) / 6) ** 2 + ((y + 0.5 - 13) / 6) ** 2 > 1) continue
          set.fill(-8, y, z, 8, y + 1, z + 1, (x) => (x === -8 || x === 7 ? c.base : c.shade), { jitter: 0.02 })
        }
      set.fill(-6, 12, -2, 6, 13, 2, 0xfff1c1, { glow: 1, jitter: 0 })
      set.fill(4, 8, 2, 5, 12, 3, METAL, flat)
      set.put(4, 7, 2, c.base, flat)
      return [{ x: 0, y: 12, z: 0, color: 0xffe2b0, intensity: 0.7, distance: 2.4 }]
    },
  },
  {
    id: 'candles', name: 'Velas', category: 'luces', width: 12, depth: 12, y: ON_TABLE,
    colors: {},
    build(set) {
      // Tres velas de distinto alto sobre un plato, con su mecha, la llama y una gota de cera
      disc(set, 0, 0, 0, 1, 6, 0xc9a227)
      disc(set, 0, 0, 1, 2, 6, shade(0xc9a227, 0.15), undefined, 5)
      for (const [x0, z0, size, height] of [[-4, -4, 3, 14], [2, -4, 2, 10], [0, 1, 3, 8]]) {
        set.fill(x0, 1, z0, x0 + size, 1 + height, z0 + size, CREAM, { jitter: 0.03 })
        set.put(x0, height - 1, z0 + size, shade(CREAM, -0.08), flat)
        set.put(x0, height - 2, z0 + size, shade(CREAM, -0.08), flat)
        const fx = x0 + Math.floor(size / 2)
        const fz = z0 + Math.floor(size / 2)
        set.put(fx, 1 + height, fz, INK, flat)
        set.put(fx, 2 + height, fz, 0xff8c2a, { glow: 1, jitter: 0 })
        set.put(fx, 3 + height, fz, 0xffb347, { glow: 1, jitter: 0 })
        set.put(fx, 4 + height, fz, 0xffe08a, { glow: 1, jitter: 0 })
      }
      return [{ x: 0, y: 16, z: 0, color: 0xffb347, intensity: 0.4, distance: 1.6 }]
    },
  },
  {
    id: 'lantern', name: 'Farol', category: 'luces', width: 10, depth: 10,
    colors: { metal: { label: 'Fierro', value: 0x2f2f36 } },
    build(set, c) {
      // Un farol de fierro: la base, cuatro postes, el vidrio encendido, el techo en punta y su argolla
      set.fill(-5, 0, -5, 5, 2, 5, c.metal, flat)
      for (const [x, z] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) set.fill(x, 2, z, x + 1, 14, z + 1, c.metal, flat)
      set.fill(-4, 2, -4, 4, 14, 4, (_x, y) => (y < 7 ? 0xffc27a : 0xffe2a8), { glow: 0.9, jitter: 0 })
      set.fill(-5, 14, -5, 5, 16, 5, c.metal, flat)
      set.fill(-3, 16, -3, 3, 18, 3, c.metal, flat)
      set.fill(-1, 18, -1, 1, 20, 1, c.metal, flat)
      frameRing(set, -1, 21, 1, 23, 0, 1, c.metal)
      return [{ x: 0, y: 9, z: 0, color: 0xffc27a, intensity: 1.6, distance: 5 }]
    },
  },

  // ─── Plantas ───
  {
    id: 'planterBox', name: 'Jardinera', category: 'plantas', width: 64, depth: 14,
    colors: { wood: { label: 'Madera', value: 0x8a6a4f } },
    build(set, c) {
      // Un cajón de tablas con patas cortas, la tierra, cuatro matas y flores sueltas
      for (const x of [-32, 30]) for (const z of [-7, 5]) set.fill(x, 0, z, x + 2, 2, z + 2, shade(c.wood, -0.35), flat)
      set.fill(-32, 2, -7, 32, 14, 7, (_x, y) => ((y - 2) % 4 === 3 ? shade(c.wood, -0.22) : shade(c.wood, (hash(y >> 2, 3) - 0.5) * 0.14)), flat)
      set.fill(-32, 13, -7, 32, 14, 7, shade(c.wood, 0.1), flat)
      set.fill(-30, 13, -5, 30, 14, 5, SOIL, flat)
      for (const x of [-22, -8, 8, 22]) foliage(set, x, 15, 0, 7, 14)
      for (let i = 0; i < 12; i++) set.put(-28 + Math.floor(set.next() * 56), 17 + Math.floor(set.next() * 5), -4 + Math.floor(set.next() * 8), pick(set, [0xe8738f, 0xf2c14e, WHITE, 0xb79dcf]), flat)
    },
  },
  {
    id: 'plant', name: 'Planta chica', category: 'plantas', width: 16, depth: 16,
    colors: { pot: { label: 'Macetero', value: 0xb5654a } },
    build(set, c) {
      disc(set, 0, 0, 0, 10, 5.4, (_x, y) => (y === 0 ? shade(c.pot, -0.2) : y === 3 ? shade(c.pot, -0.08) : c.pot))
      disc(set, 0, 0, 10, 12, 6.6, shade(c.pot, 0.1), undefined, 5)
      disc(set, 0, 0, 10, 11, 5, SOIL)
      foliage(set, 0, 12, 0, 10, 34)
    },
  },
  {
    id: 'tallPlant', name: 'Planta alta', category: 'plantas', width: 28, depth: 28,
    colors: { pot: { label: 'Macetero', value: 0xb5654a } },
    build(set, c) {
      for (let y = 0; y < 20; y++) disc(set, 0, 0, y, y + 1, 9.2 + y * 0.14, y >= 4 && y < 7 ? shade(c.pot, -0.15) : c.pot)
      disc(set, 0, 0, 20, 22, 12.4, shade(c.pot, 0.1), undefined, 10)
      disc(set, 0, 0, 20, 21, 10, SOIL)
      // Un tronco que se curva un poco, más grueso abajo, tres ramas y hojas sueltas en cada una
      for (let y = 21; y < 54; y++) {
        const x = Math.round(Math.sin(y * 0.15) * 1.6)
        set.put(x, y, 0, BARK)
        if (y < 34) set.put(x + 1, y, 0, shade(BARK, -0.1))
      }
      for (const [dx, y, dz] of [[-8, 36, 4], [8, 42, -4], [-4, 48, -8]]) {
        for (let t = 1; t <= 6; t++) set.put(Math.round((dx * t) / 6), y + Math.floor(t / 2), Math.round((dz * t) / 6), BARK)
        foliage(set, dx, y + 4, dz, 10, 24)
      }
      foliage(set, 0, 56, 0, 14, 44)
    },
  },
  {
    id: 'cactus', name: 'Cactus', category: 'plantas', width: 12, depth: 12,
    colors: { pot: { label: 'Macetero', value: 0xe8c07a } },
    build(set, c) {
      disc(set, 0, 0, 0, 8, 5.2, (_x, y) => (y === 2 ? shade(c.pot, -0.12) : c.pot))
      disc(set, 0, 0, 8, 10, 6.2, shade(c.pot, -0.12), undefined, 3.2)
      disc(set, 0, 0, 8, 9, 3.2, SOIL)
      const green = 0x4f8a4f
      // Costillas verticales y espinas claras sueltas
      const rib = (x: number, y: number, z: number) => (hash(x, y, z) < 0.07 ? 0xe8f0d0 : (x + z) % 2 ? green : shade(green, -0.15))
      disc(set, 0, 0, 9, 32, 2, rib)
      disc(set, 0, 0, 32, 33, 1.5, rib)
      // Dos brazos que suben y una flor arriba
      set.fill(-5, 16, -1, -2, 19, 1, rib)
      set.fill(-6, 17, -1, -4, 27, 1, rib)
      set.fill(2, 20, -1, 5, 23, 1, rib)
      set.fill(4, 21, -1, 6, 30, 1, rib)
      set.fill(-2, 33, -1, 2, 34, 1, 0xe8738f, { jitter: 0.04 })
      set.fill(-1, 33, -2, 1, 34, 2, 0xe8738f, { jitter: 0.04 })
      set.put(-1, 34, -1, 0xf2c14e, flat)
      set.put(0, 34, 0, 0xf2c14e, flat)
    },
  },
  {
    id: 'hangingPlant', name: 'Planta colgante', category: 'plantas', width: 16, depth: 12, onWall: true, y: 60,
    colors: { pot: { label: 'Macetero', value: 0xf4f0e6 } },
    build(set, c) {
      // El soporte en la pared, la cadena, el macetero redondo y las guías que caen
      set.fill(0, 30, -6, 1, 40, -5, METAL, flat)
      set.fill(0, 37, -5, 1, 38, 2, METAL, flat)
      for (let y = 21; y < 37; y++) set.put(0, y, 1, y % 2 ? METAL : 0x5a5a64, flat)
      for (let y = 8; y < 20; y++) disc(set, 0.5, 1, y, y + 1, 3.2 + Math.min(y - 8, 6) * 0.6, y === 19 ? shade(c.pot, -0.1) : y === 12 ? shade(c.pot, -0.05) : c.pot)
      disc(set, 0.5, 1, 19, 20, 5.4, SOIL)
      foliage(set, 0, 20, 1, 6, 14)
      for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * Math.PI * 2
        let x = Math.round(0.5 + Math.cos(angle) * 6)
        const z = Math.max(-5, Math.round(1 + Math.sin(angle) * 6))
        const length = 12 + Math.floor(set.next() * 18)
        for (let k = 0; k < length; k++) {
          const y = 17 - k
          if (k % 5 === 4) x += set.next() < 0.5 ? -1 : 1
          set.put(x, y, z, LEAF_DARK, { jitter: 0.06 })
          if (k % 3 === 0) set.put(x + (k % 6 === 0 ? 1 : -1), y, z, set.next() < 0.5 ? LEAF : LEAF_LIGHT, { jitter: 0.06 })
        }
      }
    },
  },

  // ─── Piso ───
  {
    id: 'rug', name: 'Alfombra', category: 'piso', width: 104, depth: 136,
    colors: { main: { label: 'Fondo', value: 0x8c5a7a }, accent: { label: 'Dibujo', value: 0xc48aa8 } },
    options: {
      pattern: { label: 'Dibujo', values: ['rombo', 'rayas', 'borde', 'cuadros'] },
      size: { label: 'Tamaño', values: ['grande', 'mediana', 'chica', 'larga'] },
    },
    build(set, c, o) {
      const [w, d] = o.size === 'chica' ? [56, 40] : o.size === 'mediana' ? [80, 96] : o.size === 'larga' ? [64, 240] : [104, 136]
      const x0 = -half(w), z0 = -half(d)
      const fiber = (x: number, z: number) => (hash(x, z, 2) < 0.06 ? shade(c.main, -0.06) : c.main)
      set.fill(x0, 0, z0, x0 + w, 1, z0 + d, (x, _y, z) => {
        const lx = x - x0, lz = z - z0
        const ring = Math.min(lx, lz, w - 1 - lx, d - 1 - lz)
        // Un borde oscuro y dos líneas finas del color del dibujo
        if (ring < 2) return shade(c.main, -0.25)
        if (ring === 4 || ring === 8) return c.accent
        if (ring < 10) return fiber(x, z)
        if (o.pattern === 'rayas') return Math.floor((lz - 10) / 6) % 2 ? c.accent : c.main
        if (o.pattern === 'cuadros') return (Math.floor((lx - 10) / 12) + Math.floor((lz - 10) / 12)) % 2 ? c.accent : c.main
        if (o.pattern === 'rombo') {
          const diamond = Math.abs(lx - w / 2 + 0.5) + Math.abs(lz - d / 2 + 0.5)
          if (diamond <= 4 || (diamond <= Math.min(w, d) * 0.4 && Math.round(diamond) % 12 <= 1)) return c.accent
        }
        return fiber(x, z)
      }, flat)
      // Flecos en los dos extremos
      for (let x = x0 + 2; x < x0 + w - 2; x += 2) {
        set.fill(x, 0, z0 - 2, x + 1, 1, z0, 0xe8e2d4, { jitter: 0.03 })
        set.fill(x, 0, z0 + d, x + 1, 1, z0 + d + 2, 0xe8e2d4, { jitter: 0.03 })
      }
    },
  },
]

export const PROPS_BY_ID = new Map(PROPS.map((prop) => [prop.id, prop]))

// Los colores y opciones de un mueble: los que se le dieron, y los de siempre para el resto
export function resolveProp(id: string, colors: Record<string, number> = {}, options: Record<string, string> = {}) {
  const def = PROPS_BY_ID.get(id)
  if (!def) return null
  const resolvedColors = Object.fromEntries(Object.entries(def.colors).map(([key, color]) => [key, colors[key] ?? color.value]))
  const resolvedOptions = Object.fromEntries(Object.entries(def.options ?? {}).map(([key, option]) => [key, options[key] ?? option.values[0]]))
  return { def, colors: resolvedColors, options: resolvedOptions }
}
