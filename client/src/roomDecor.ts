import * as THREE from 'three'
import type { Decor } from './roomLayout'

// Los adornos de la sala, hechos de bloques mientras no exista el arte de cada cosa. Cada uno se arma mirando
// hacia +z con su parte de atrás en el origen, y después se gira y se lleva a su lugar (ver Decor en roomLayout)

const WALL_INSET = 0.16 // lo que cuelga de una pared queda justo delante de ella (la pared mide 0,3 de grueso)
const BOOK_COLORS = [0xc0504d, 0x4f81bd, 0x9bbb59, 0xf2c14e, 0x8064a2, 0xe8e2d4, 0x4bacc6, 0xd9822b]
const LEAF = 0x4f9d5d
const DARK_LEAF = 0x3a7a48
const POT = 0xb5654a

const materials = new Map<string, THREE.MeshStandardMaterial>()

// Los materiales se comparten entre adornos del mismo color: menos memoria de video
function material(color: number, glow = 0) {
  const key = `${color}-${glow}`
  let found = materials.get(key)
  if (!found) {
    found = new THREE.MeshStandardMaterial({ color, emissive: glow ? color : 0x000000, emissiveIntensity: glow })
    materials.set(key, found)
  }
  return found
}

function box(group: THREE.Group, size: [number, number, number], position: [number, number, number], color: number, glow = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, glow))
  mesh.position.set(...position)
  group.add(mesh)
  return mesh
}

// Un número fijo para cada adorno, así los libros salen siempre iguales en la misma sala
function seededRandom(seed: number) {
  let value = seed
  return () => {
    value = (value * 9301 + 49297) % 233280
    return value / 233280
  }
}

function buildShelf(group: THREE.Group, item: Decor, seed: number) {
  const width = item.width ?? 2
  const height = item.height ?? 2
  const depth = item.depth ?? 0.4
  const wood = item.color ?? 0x5b3d2a
  const random = seededRandom(seed)
  box(group, [width, height, 0.04], [0, height / 2, 0.02], wood) // el fondo
  box(group, [0.06, height, depth], [-width / 2 + 0.03, height / 2, depth / 2], wood)
  box(group, [0.06, height, depth], [width / 2 - 0.03, height / 2, depth / 2], wood)
  const levels = Math.max(3, Math.round(height / 0.5))
  const gap = height / levels
  for (let level = 0; level <= levels; level++) {
    box(group, [width, 0.04, depth], [0, Math.min(level * gap, height - 0.02) + 0.02, depth / 2], wood)
    if (level === levels) break
    // Libros de alturas y colores distintos, con algún hueco
    let x = -width / 2 + 0.1
    while (x < width / 2 - 0.15) {
      const bookWidth = 0.05 + random() * 0.06
      if (random() > 0.12) {
        const bookHeight = gap * (0.55 + random() * 0.3)
        const color = BOOK_COLORS[Math.floor(random() * BOOK_COLORS.length)]
        box(group, [bookWidth, bookHeight, depth * 0.75], [x + bookWidth / 2, level * gap + 0.04 + bookHeight / 2, depth / 2], color)
      }
      x += bookWidth + 0.008
    }
  }
}

function buildWindow(group: THREE.Group, item: Decor) {
  const width = item.width ?? 2
  const height = item.height ?? 1.2
  const frame = 0xe8e4da
  // El vidrio: un cielo de tarde que brilla un poco, para que la sala no se vea cerrada
  box(group, [width, height, 0.03], [0, 0, 0.015], 0x9cc3e6, 0.35)
  box(group, [width + 0.12, 0.07, 0.08], [0, height / 2, 0.04], frame)
  box(group, [width + 0.12, 0.09, 0.14], [0, -height / 2, 0.07], frame) // el alféizar
  box(group, [0.07, height, 0.08], [-width / 2, 0, 0.04], frame)
  box(group, [0.07, height, 0.08], [width / 2, 0, 0.04], frame)
  box(group, [0.05, height, 0.06], [0, 0, 0.04], frame)
  box(group, [width, 0.05, 0.06], [0, 0, 0.04], frame)
}

function buildBoard(group: THREE.Group, item: Decor, isChalk: boolean) {
  const width = item.width ?? 2.4
  const height = item.height ?? 1.2
  const surface = isChalk ? 0x2f3b33 : 0xf4f4f0
  const ink = isChalk ? [0xf4f4f0, 0xf2c14e, 0xe8a0a0] : [0x4f81bd, 0xc0504d, 0x2f3b33]
  box(group, [width + 0.1, height + 0.1, 0.04], [0, 0, 0.02], isChalk ? 0x6b4a33 : 0x9aa0a6)
  box(group, [width, height, 0.03], [0, 0, 0.05], surface)
  // Unas líneas escritas
  const random = seededRandom(Math.round(width * 100))
  const lines = isChalk ? 4 : 5
  for (let index = 0; index < lines; index++) {
    const lineWidth = width * (0.25 + random() * 0.45)
    const y = height / 2 - 0.2 - index * ((height - 0.3) / lines)
    box(group, [lineWidth, 0.035, 0.01], [-width / 2 + 0.15 + lineWidth / 2, y, 0.07], ink[index % ink.length])
  }
  if (!isChalk) box(group, [width * 0.6, 0.05, 0.1], [0, -height / 2 - 0.05, 0.08], 0x9aa0a6) // la bandeja de los plumones
}

function buildClock(group: THREE.Group) {
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24), material(0xf4f4f0))
  face.rotation.x = Math.PI / 2
  face.position.z = 0.03
  group.add(face)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 24), material(0x2f2f36))
  rim.position.z = 0.05
  group.add(rim)
  box(group, [0.02, 0.13, 0.01], [0, 0.05, 0.065], 0x2f2f36)
  const minute = box(group, [0.015, 0.18, 0.01], [0.04, 0.03, 0.07], 0x2f2f36)
  minute.rotation.z = -1
}

function buildPoster(group: THREE.Group, item: Decor) {
  const width = item.width ?? 0.8
  const height = item.height ?? 1.1
  const color = item.color ?? 0xf2a65a
  box(group, [width, height, 0.02], [0, 0, 0.01], 0xf4f0e6)
  box(group, [width * 0.8, height * 0.55, 0.01], [0, height * 0.1, 0.025], color)
  box(group, [width * 0.6, 0.05, 0.01], [0, -height * 0.3, 0.025], 0x45475a)
}

function buildPlant(group: THREE.Group, isTall: boolean) {
  const potHeight = isTall ? 0.45 : 0.28
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(isTall ? 0.24 : 0.17, isTall ? 0.18 : 0.13, potHeight, 10), material(POT))
  pot.position.y = potHeight / 2
  group.add(pot)
  if (isTall) {
    box(group, [0.05, 0.9, 0.05], [0, potHeight + 0.45, 0], 0x6b4a33)
    box(group, [0.55, 0.45, 0.55], [0, potHeight + 1.0, 0], LEAF)
    box(group, [0.4, 0.35, 0.4], [0.12, potHeight + 1.35, -0.05], DARK_LEAF)
    box(group, [0.35, 0.3, 0.35], [-0.15, potHeight + 0.75, 0.1], DARK_LEAF)
  } else {
    box(group, [0.32, 0.25, 0.32], [0, potHeight + 0.12, 0], LEAF)
    box(group, [0.18, 0.22, 0.18], [0.06, potHeight + 0.3, -0.04], DARK_LEAF)
  }
}

function buildRug(group: THREE.Group, item: Decor) {
  const width = item.width ?? 2
  const depth = item.depth ?? 3
  const color = item.color ?? 0x8c5a7a
  box(group, [width, 0.012, depth], [0, 0.006, 0], color)
  // Un borde más claro
  const border = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3).getHex()
  box(group, [width - 0.2, 0.014, 0.06], [0, 0.008, depth / 2 - 0.15], border)
  box(group, [width - 0.2, 0.014, 0.06], [0, 0.008, -depth / 2 + 0.15], border)
}

// La lámpara verde de biblioteca, al centro de la mesa
function buildTableLamp(group: THREE.Group) {
  const top = 0.75
  box(group, [0.16, 0.03, 0.1], [0, top + 0.015, 0], 0xc9a227)
  box(group, [0.025, 0.28, 0.025], [0, top + 0.16, 0], 0xc9a227)
  box(group, [0.34, 0.08, 0.14], [0, top + 0.32, 0], 0x2f7a4f)
  box(group, [0.3, 0.02, 0.1], [0, top + 0.27, 0], 0xfff1c1, 0.9) // la luz
}

function buildFloorLamp(group: THREE.Group) {
  box(group, [0.3, 0.04, 0.3], [0, 0.02, 0], 0x2f2f36)
  box(group, [0.04, 1.5, 0.04], [0, 0.77, 0], 0x2f2f36)
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.3, 12, 1, true), material(0xf6e7c1, 0.6))
  shade.position.y = 1.6
  group.add(shade)
}

function buildArmchair(group: THREE.Group, item: Decor) {
  const color = item.color ?? 0x7f8cc4
  const dark = new THREE.Color(color).multiplyScalar(0.75).getHex()
  box(group, [0.9, 0.4, 0.85], [0, 0.2, 0], dark)
  box(group, [0.7, 0.14, 0.65], [0, 0.47, 0.06], color)
  box(group, [0.9, 0.55, 0.18], [0, 0.67, -0.34], color) // el respaldo
  box(group, [0.14, 0.3, 0.8], [-0.38, 0.55, 0], dark)
  box(group, [0.14, 0.3, 0.8], [0.38, 0.55, 0], dark)
}

function buildCabinet(group: THREE.Group, item: Decor) {
  const width = item.width ?? 1.2
  const height = item.height ?? 0.8
  const depth = item.depth ?? 0.5
  const color = item.color ?? 0x8a6a4f
  box(group, [width, height, depth], [0, height / 2, depth / 2], color)
  box(group, [0.01, height - 0.15, 0.01], [0, height / 2, depth + 0.005], 0x5b3d2a) // la línea entre las puertas
  box(group, [0.04, 0.12, 0.03], [-0.06, height / 2, depth + 0.015], 0xd9c9a8)
  box(group, [0.04, 0.12, 0.03], [0.06, height / 2, depth + 0.015], 0xd9c9a8)
}

// La barra del café: el mueble, su cubierta, la cafetera y unas tazas
function buildCounter(group: THREE.Group, item: Decor) {
  const width = item.width ?? 4
  const depth = item.depth ?? 0.8
  const height = 1.05
  box(group, [width, height - 0.05, depth], [0, (height - 0.05) / 2, depth / 2], 0x5b3d2a)
  box(group, [width + 0.1, 0.06, depth + 0.1], [0, height - 0.03, depth / 2], 0xd9c9a8)
  // La cafetera
  box(group, [0.6, 0.45, 0.4], [-width / 4, height + 0.225, 0.25], 0x9aa0a6)
  box(group, [0.5, 0.08, 0.3], [-width / 4, height + 0.49, 0.25], 0x45475a)
  box(group, [0.08, 0.06, 0.08], [-width / 4 - 0.12, height + 0.06, 0.5], 0xf4f4f0)
  box(group, [0.08, 0.06, 0.08], [-width / 4 + 0.12, height + 0.06, 0.5], 0xf4f4f0)
  // Tazas y un frasco con galletas
  for (const offset of [0.2, 0.4, 0.6]) box(group, [0.09, 0.1, 0.09], [width / 4 + offset - 0.4, height + 0.05, 0.45], 0xf4f4f0)
  box(group, [0.22, 0.3, 0.22], [width / 2 - 0.4, height + 0.15, 0.35], 0xc9e4f2, 0.1)
  box(group, [0.16, 0.12, 0.16], [width / 2 - 0.4, height + 0.08, 0.35], 0xc98a4b)
}

const HANGS_ON_WALL = new Set(['window', 'whiteboard', 'chalkboard', 'clock', 'poster'])

export function buildDecor(items: Decor[]) {
  const all = new THREE.Group()
  items.forEach((item, index) => {
    const group = new THREE.Group()
    switch (item.kind) {
      case 'shelf':
        buildShelf(group, item, index + 7)
        break
      case 'window':
        buildWindow(group, item)
        break
      case 'whiteboard':
        buildBoard(group, item, false)
        break
      case 'chalkboard':
        buildBoard(group, item, true)
        break
      case 'clock':
        buildClock(group)
        break
      case 'poster':
        buildPoster(group, item)
        break
      case 'plant':
        buildPlant(group, false)
        break
      case 'tallPlant':
        buildPlant(group, true)
        break
      case 'rug':
        buildRug(group, item)
        break
      case 'tableLamp':
        buildTableLamp(group)
        break
      case 'floorLamp':
        buildFloorLamp(group)
        break
      case 'armchair':
        buildArmchair(group, item)
        break
      case 'cabinet':
        buildCabinet(group, item)
        break
      case 'counter':
        buildCounter(group, item)
        break
    }
    const angle = THREE.MathUtils.degToRad(item.facing ?? 0)
    group.rotation.y = angle
    // Lo que cuelga queda delante de la pared, hacia donde mira
    const inset = HANGS_ON_WALL.has(item.kind) ? WALL_INSET : 0
    group.position.set(item.x + Math.sin(angle) * inset, item.y ?? 0, item.z + Math.cos(angle) * inset)
    all.add(group)
  })
  return all
}
