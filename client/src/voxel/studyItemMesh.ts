import * as THREE from 'three'
import type { ActivityKind } from '../choices'
import { buildStudyItem, type Decal } from './studyItems'
import { voxelMesh } from './voxelView'
import { VOXEL_SIZE } from './voxels'

// Arma en Three.js el computador, cuaderno o libro de studyItems.ts frente a una persona sentada. Lo usan la
// sala (activity.ts, que además anima las manos) y la galería de diseños, para ver cómo queda cada mesa.
// El grupo mira hacia -z: la persona está en el origen y la mesa hacia adelante

export const TABLE_TOP = 0.75 // metros
export const ITEM_Z = -0.86 // metros hacia la mesa desde la silla
const PIXEL = VOXEL_SIZE / 2 // lo escrito sobre los objetos: píxeles de 1,25 cm

// Lo escrito de un objeto (studyItems.ts) en una sola figura: un cuadrado plano por píxel, en el orden en que
// aparecen. Para mostrarlo de a poco basta con dibujar los primeros (setDrawRange)
function decalMesh(decal: Decal) {
  const pixels = decal.lines.flat()
  const positions = new Float32Array(pixels.length * 12)
  const colors = new Float32Array(pixels.length * 12)
  const indices = new Uint32Array(pixels.length * 6)
  const color = new THREE.Color()
  const lift = decal.at * VOXEL_SIZE + 0.001
  pixels.forEach((pixel, index) => {
    color.setHex(pixel.color)
    ;[[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([du, dv], corner) => {
      const at = index * 12 + corner * 3
      const a = (pixel.u + du) * PIXEL
      const b = (pixel.v + dv) * PIXEL
      positions.set(decal.plane === 'top' ? [a, lift, b] : [a, b, lift], at)
      colors.set([color.r, color.g, color.b], at)
    })
    const first = index * 4
    // Acostado mira hacia arriba y parado hacia la persona: el orden de las esquinas cambia
    indices.set(decal.plane === 'top' ? [first, first + 2, first + 1, first, first + 3, first + 2] : [first, first + 1, first + 2, first, first + 2, first + 3], index * 6)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  const options = { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }
  const mesh = new THREE.Mesh(geometry, decal.glow ? new THREE.MeshBasicMaterial(options) : new THREE.MeshStandardMaterial({ ...options, roughness: 0.9 }))
  // Dónde termina cada línea, contando píxeles, para mostrar hasta cierto punto
  let total = 0
  const lineEnds = decal.lines.map((line) => (total += line.length))
  return { mesh, pixels, lineEnds }
}

export type Writing = ReturnType<typeof decalMesh>

// Muestra lo escrito hasta progress, contado en líneas (2,5 es dos líneas y media). Responde el último píxel visible
export function reveal(writing: Writing, progress: number) {
  const line = Math.floor(progress)
  const start = writing.lineEnds[line - 1] ?? 0
  const end = writing.lineEnds[line] ?? writing.pixels.length
  const count = Math.min(writing.pixels.length, start + Math.floor((end - start) * (progress - line)))
  writing.mesh.geometry.setDrawRange(0, count * 6)
  return writing.pixels[count - 1] ?? null
}

// El objeto en cubos sobre la mesa, frente a la persona: lo que no se mueve, la pantalla inclinada si tiene,
// y lo escrito. Responde lo que se anima (lo que se escribe y la hoja que da vuelta)
export function placeItem(group: THREE.Group, kind: ActivityKind, variant: number) {
  const item = buildStudyItem(kind, variant)
  const holder = new THREE.Group()
  holder.position.set(0, TABLE_TOP, ITEM_Z)
  holder.add(voxelMesh(item.base).group)
  group.add(holder)
  let screen: THREE.Group | null = null
  if (item.screen) {
    screen = new THREE.Group()
    screen.position.set(0, item.screen.hingeY * VOXEL_SIZE, item.screen.hingeZ * VOXEL_SIZE)
    screen.rotation.x = -item.screen.tilt
    screen.add(voxelMesh(item.screen.set).group)
    holder.add(screen)
  }
  let writing: Writing | null = null
  for (const decal of item.decals) {
    const built = decalMesh(decal)
    ;(decal.part === 'screen' && screen ? screen : holder).add(built.mesh)
    if (decal.animated) writing = built
  }
  let flipPivot: THREE.Group | null = null
  if (item.flip) {
    flipPivot = new THREE.Group()
    flipPivot.position.set(0, TABLE_TOP + item.flip.y * VOXEL_SIZE + 0.002, ITEM_Z)
    const width = item.flip.width * VOXEL_SIZE
    const page = new THREE.Mesh(new THREE.BoxGeometry(width, 0.004, item.flip.depth * VOXEL_SIZE), new THREE.MeshStandardMaterial({ color: item.flip.color }))
    page.position.x = width / 2
    flipPivot.add(page)
    flipPivot.visible = false
    group.add(flipPivot)
  }
  return { writing, flipPivot }
}

// La posición de un píxel de lo escrito (acostado), en metros, en el grupo de la actividad
export const pixelSpot = (pixel: { u: number; v: number }) => ({ x: (pixel.u + 0.5) * PIXEL, z: ITEM_Z + (pixel.v + 0.5) * PIXEL })

