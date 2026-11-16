import * as THREE from 'three'
import type { Sky } from './roomBuilder'
import { rotate, VOXEL_SIZE } from './voxels'

// Lo que se mueve detrás del vidrio de cada ventana: lluvia, nieve, nubes que pasan o estrellas que titilan.
// Cada diseño elige el suyo (la opción "Clima" de la ventana, en designs.ts): todos ven lo mismo. Va en
// cuadraditos del tamaño de un cubo, como el resto del arte, y se mueve solo al dibujarse (onBeforeRender),
// así no hace falta tocar el ciclo de dibujo de la sala, de la galería ni de "Estudiar solo"

export type Weather = 'nada' | 'lluvia' | 'nieve' | 'nubes' | 'estrellas'

export interface WindowSpot {
  x: number // en cubos, donde se puso la ventana (como en PlacedProp)
  y: number
  z: number
  rotation: number
  sky: Sky
  weather: Weather
}

// El vidrio de la ventana (props.ts), en cubos desde su centro: el cielo pintado tiene su cara en z = -3 y
// el marco, el parteluz y el travesaño quedan delante, así que tapan lo que pasa por detrás de ellos
const LEFT = -48
const RIGHT = 48
const TOP = 52
const BEHIND_GLASS = -2.9

interface Flake {
  x: number
  y: number
  w: number
  h: number
}

// Cada clima: cuántos cuadraditos, de qué color y dónde está cada uno en el segundo t
interface Effect {
  count: number
  color: (index: number) => number
  at: (index: number, t: number) => Flake | null // null: fuera del vidrio, no se dibuja
  twinkle?: (index: number, t: number) => number // cuánto brilla, de 0 a 1
}

const wrap = (value: number, size: number) => ((value % size) + size) % size

function rain(): Effect {
  const drops = Array.from({ length: 70 }, () => ({ x: LEFT + Math.floor(Math.random() * (RIGHT - LEFT)), speed: 50 + Math.random() * 20, phase: Math.random() * 100 }))
  return {
    count: drops.length,
    color: () => 0xcfe0f2,
    at: (i, t) => {
      const drop = drops[i]
      const y = TOP + 3 - wrap(t * drop.speed + drop.phase, TOP + 6)
      return y < 0 || y + 3 > TOP ? null : { x: drop.x, y, w: 1, h: 3 }
    },
  }
}

function snow(): Effect {
  const flakes = Array.from({ length: 60 }, () => ({ x: LEFT + Math.random() * (RIGHT - LEFT), speed: 6 + Math.random() * 4, phase: Math.random() * 100 }))
  return {
    count: flakes.length,
    color: () => 0xffffff,
    at: (i, t) => {
      const flake = flakes[i]
      const y = TOP + 1 - wrap(t * flake.speed + flake.phase, TOP + 2)
      const x = Math.floor(flake.x + Math.sin(t * 0.8 + flake.phase) * 2)
      return y < 0 || y + 1 > TOP || x < LEFT || x >= RIGHT ? null : { x, y, w: 1, h: 1 }
    },
  }
}

// Nubes como las fijas de la ventana (props.ts), hechas de cubos, que cruzan despacio y se cortan en el marco
function clouds(sky: Sky): Effect {
  const day = sky === 'dia'
  const shapes = day ? [[-28, 40, 8], [-20, 42, 6], [4, 46, 8], [34, 28, 6]] : [[-24, 34, 12], [8, 42, 10], [28, 30, 8]]
  const cells: { cloud: number; dx: number; y: number }[] = []
  const clouds = shapes.map(([cx, cy, rx], cloud) => {
    const ry = day ? 3.2 : 1.6
    for (let dx = -Math.floor(rx); dx <= rx; dx++)
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) if ((dx / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) cells.push({ cloud, dx, y })
    return { start: cx, reach: rx + 1, speed: 1.2 + cloud * 0.4 }
  })
  const span = RIGHT - LEFT
  return {
    count: cells.length,
    color: () => (day ? 0xffffff : 0xf2b8a0),
    at: (i, t) => {
      const cell = cells[i]
      const cloud = clouds[cell.cloud]
      // Sale por la derecha y vuelve a entrar por la izquierda, con espacio para que entre entera
      const center = LEFT - cloud.reach + wrap(cloud.start - LEFT + cloud.reach + t * cloud.speed, span + cloud.reach * 2)
      const x = Math.floor(center) + cell.dx
      return x < LEFT || x >= RIGHT ? null : { x, y: cell.y, w: 1, h: 1 }
    },
  }
}

function stars(): Effect {
  const list: { x: number; y: number; speed: number; phase: number }[] = []
  while (list.length < 40) {
    const x = LEFT + 1 + Math.floor(Math.random() * 94)
    const y = 24 + Math.floor(Math.random() * 27)
    if ((x - 25) ** 2 + (y - 37) ** 2 < 81) continue // sin tapar la luna
    list.push({ x, y, speed: 1 + Math.random() * 2.5, phase: Math.random() * 10 })
  }
  return {
    count: list.length,
    color: () => 0xfff4cf,
    at: (i) => ({ x: list[i].x, y: list[i].y, w: 1, h: 1 }),
    twinkle: (i, t) => 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * list[i].speed + list[i].phase)),
  }
}

function effectFor(spot: WindowSpot): Effect | null {
  switch (spot.weather) {
    case 'lluvia':
      return rain()
    case 'nieve':
      return snow()
    case 'nubes':
      return spot.sky === 'noche' ? null : clouds(spot.sky)
    case 'estrellas':
      return spot.sky === 'noche' ? stars() : null
    default:
      return null
  }
}

function weatherMesh(spot: WindowSpot, effect: Effect) {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, effect.count)
  mesh.frustumCulled = false // las posiciones cambian en cada cuadro
  const base = Array.from({ length: effect.count }, (_, i) => new THREE.Color().setHex(effect.color(i)).multiplyScalar(0.95))
  base.forEach((color, i) => mesh.setColorAt(i, color))
  const matrix = new THREE.Matrix4()
  const shown = new THREE.Color()
  const update = () => {
    const t = performance.now() / 1000
    for (let i = 0; i < effect.count; i++) {
      const flake = effect.at(i, t)
      if (!flake) matrix.makeScale(0, 0, 0)
      else matrix.makeScale(flake.w, flake.h, 1).setPosition(flake.x + flake.w / 2, flake.y + flake.h / 2, BEHIND_GLASS)
      mesh.setMatrixAt(i, matrix)
      if (effect.twinkle) mesh.setColorAt(i, shown.copy(base[i]).multiplyScalar(effect.twinkle(i, t)))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (effect.twinkle && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
  update()
  mesh.onBeforeRender = update

  // Como merge en voxels.ts: girar un cubo deja su esquina un cubo más allá en los ejes que se dan vuelta
  const holder = new THREE.Group()
  const [flipX, flipZ] = rotate(1, 1, spot.rotation)
  holder.position.set((spot.x + (flipX < 0 ? 1 : 0)) * VOXEL_SIZE, spot.y * VOXEL_SIZE, (spot.z + (flipZ < 0 ? 1 : 0)) * VOXEL_SIZE)
  holder.rotation.y = (spot.rotation * Math.PI) / 180
  holder.scale.setScalar(VOXEL_SIZE)
  holder.add(mesh)
  return holder
}

// Todo lo que se mueve en las ventanas de una sala, en el mismo lugar que sus cubos (voxelMesh)
export function windowWeather(windows: WindowSpot[]) {
  const group = new THREE.Group()
  for (const spot of windows) {
    const effect = effectFor(spot)
    if (effect) group.add(weatherMesh(spot, effect))
  }
  return group
}
