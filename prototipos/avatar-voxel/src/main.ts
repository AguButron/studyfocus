import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const C = {
  skin: 0xf0b98d, skinDark: 0xd99a6c, hair: 0x4a2f22, hairLight: 0x6b4631, glasses: 0x17171f, lens: 0x2d3a4f, eye: 0x2a1c16, mouth: 0xa85f4f,
  shirt: 0xf4f1e8, shirtDark: 0xd8d4c8, strap: 0x6b4a33, belt: 0xb23a3a, beltLight: 0xe9e2d0, jeans: 0x8fa6d6, jeansDark: 0x7088bd, cuff: 0xc7d3ee,
  shoe: 0xc0392b, shoeDark: 0x96281f, sole: 0xc9a56a, watch: 0x2f2f38,
}

type Voxels = Map<string, number>
const key = (x: number, y: number, z: number) => `${x},${y},${z}`

function fill(v: Voxels, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) v.set(key(x, y, z), color)
}

// Coordenadas: x derecha, y arriba, z hacia el frente. Los pies están en y = 0.
function buildParts() {
  const legL: Voxels = new Map(), legR: Voxels = new Map(), torso: Voxels = new Map(), head: Voxels = new Map(), armL: Voxels = new Map(), armR: Voxels = new Map()

  for (const [v, x0] of [[legL, -6], [legR, 1]] as const) {
    fill(v, x0, 0, -3, x0 + 4, 0, 4, C.sole)
    fill(v, x0, 1, -3, x0 + 4, 3, 4, C.shoe)
    fill(v, x0, 1, 2, x0 + 4, 1, 4, C.shoeDark)
    fill(v, x0 + 1, 3, 3, x0 + 3, 3, 3, C.beltLight)
    fill(v, x0, 4, -2, x0 + 4, 5, 2, C.cuff)
    fill(v, x0, 6, -2, x0 + 4, 14, 2, C.jeans)
    fill(v, x0 + (x0 < 0 ? 4 : 0), 6, -2, x0 + (x0 < 0 ? 4 : 0), 14, 2, C.jeansDark)
    fill(v, x0, 9, -2, x0 + 4, 9, 2, C.jeansDark)
  }

  fill(torso, -6, 15, -3, 6, 16, 3, C.jeans)
  fill(torso, -6, 17, -3, 6, 18, 3, C.belt)
  for (let x = -6; x <= 6; x += 3) fill(torso, x, 17, 3, x, 18, 3, C.beltLight)
  fill(torso, -1, 17, 3, 1, 18, 3, C.beltLight)
  fill(torso, -6, 19, -3, 6, 28, 3, C.shirt)
  fill(torso, -6, 19, -3, -6, 28, -3, C.shirtDark)
  fill(torso, 0, 19, 3, 0, 26, 3, C.shirtDark)
  fill(torso, -1, 27, 3, 1, 28, 3, C.skin)
  for (const x of [-4, 4]) {
    fill(torso, x, 19, 3, x, 28, 3, C.strap)
    fill(torso, x, 19, -3, x, 28, -3, C.strap)
    fill(torso, x, 28, -3, x, 28, 3, C.strap)
  }

  for (const [v, x0, x1] of [[armL, -10, -7], [armR, 7, 10]] as const) {
    fill(v, x0, 21, -2, x1, 28, 1, C.shirt)
    fill(v, x0, 20, -2, x1, 20, 1, C.shirtDark)
    fill(v, x0, 15, -2, x1, 19, 1, C.skin)
    fill(v, x0, 18, -2, x1, 18, 1, C.watch)
    fill(v, x0, 12, -2, x1, 14, 1, C.skin)
    fill(v, x0, 12, 1, x1, 12, 1, C.skinDark)
  }

  fill(head, -2, 29, -2, 2, 30, 2, C.skinDark)
  fill(head, -7, 31, -6, 7, 43, 6, C.skin)
  fill(head, -8, 36, -2, -8, 38, 0, C.skinDark)
  fill(head, 8, 36, -2, 8, 38, 0, C.skinDark)
  fill(head, -7, 41, -6, 7, 45, 6, C.hair)
  fill(head, -7, 36, -6, 7, 45, -3, C.hair)
  fill(head, -7, 39, -6, -7, 44, 6, C.hair)
  fill(head, 7, 39, -6, 7, 44, 6, C.hair)
  fill(head, -6, 44, -5, 6, 47, 5, C.hair)
  fill(head, -5, 46, 0, 3, 48, 7, C.hairLight)
  fill(head, -7, 43, 5, 2, 45, 7, C.hair)
  fill(head, -6, 41, 6, -3, 42, 6, C.hair)
  // Rostro
  fill(head, -7, 38, 7, 7, 38, 7, C.glasses)
  fill(head, -6, 35, 7, -1, 39, 7, C.glasses)
  fill(head, 1, 35, 7, 6, 39, 7, C.glasses)
  fill(head, -5, 36, 7, -2, 38, 7, C.lens)
  fill(head, 2, 36, 7, 5, 38, 7, C.lens)
  fill(head, -4, 37, 7, -3, 37, 7, C.eye)
  fill(head, 3, 37, 7, 4, 37, 7, C.eye)
  fill(head, 0, 37, 7, 0, 38, 7, C.glasses)
  fill(head, -8, 38, -3, -8, 38, 6, C.glasses)
  fill(head, 8, 38, -3, 8, 38, 6, C.glasses)
  fill(head, -1, 33, 7, 1, 35, 7, C.skinDark)
  fill(head, -2, 32, 7, 2, 32, 7, C.mouth)

  return {
    legL: { voxels: legL, pivot: [-4, 15, 0] }, legR: { voxels: legR, pivot: [3, 15, 0] }, torso: { voxels: torso, pivot: [0, 15, 0] },
    head: { voxels: head, pivot: [0, 29, 0] }, armL: { voxels: armL, pivot: [-8.5, 27, 0] }, armR: { voxels: armR, pivot: [8.5, 27, 0] },
  }
}

function downsample(voxels: Voxels, factor: number) {
  if (factor === 1) return voxels
  const cells = new Map<string, Map<number, number>>()
  for (const [k, color] of voxels) {
    const [x, y, z] = k.split(',').map(Number)
    const cell = key(Math.floor(x / factor), Math.floor(y / factor), Math.floor(z / factor))
    const counts = cells.get(cell) ?? new Map<number, number>()
    counts.set(color, (counts.get(color) ?? 0) + 1)
    cells.set(cell, counts)
  }
  const result: Voxels = new Map()
  for (const [cell, counts] of cells) result.set(cell, [...counts].sort((a, b) => b[1] - a[1])[0][0])
  return result
}

const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
]
const AO_LEVELS = [0.52, 0.7, 0.86, 1]

// Solo se crean las caras visibles; las esquinas se oscurecen según sus bloques vecinos
function buildGeometry(voxels: Voxels, pivot: number[], size: number, factor: number) {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = []
  const color = new THREE.Color()
  const solid = (x: number, y: number, z: number) => voxels.has(key(x, y, z))
  const scale = size * factor

  for (const [k, hex] of voxels) {
    const [x, y, z] = k.split(',').map(Number)
    for (const { n, u, v } of FACES) {
      if (solid(x + n[0], y + n[1], z + n[2])) continue
      const base = positions.length / 3
      const ao: number[] = []
      for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const su = a ? 1 : -1, sv = b ? 1 : -1
        const ox = x + n[0], oy = y + n[1], oz = z + n[2]
        const side1 = solid(ox + u[0] * su, oy + u[1] * su, oz + u[2] * su)
        const side2 = solid(ox + v[0] * sv, oy + v[1] * sv, oz + v[2] * sv)
        const corner = solid(ox + u[0] * su + v[0] * sv, oy + u[1] * su + v[1] * sv, oz + u[2] * su + v[2] * sv)
        const level = side1 && side2 ? 0 : 3 - (Number(side1) + Number(side2) + Number(corner))
        ao.push(level)
        const cx = x + (n[0] > 0 ? 1 : 0) + u[0] * a + v[0] * b
        const cy = y + (n[1] > 0 ? 1 : 0) + u[1] * a + v[1] * b
        const cz = z + (n[2] > 0 ? 1 : 0) + u[2] * a + v[2] * b
        positions.push(cx * scale - pivot[0] * size, cy * scale - pivot[1] * size, cz * scale - pivot[2] * size)
        normals.push(n[0], n[1], n[2])
        color.setHex(hex).multiplyScalar(AO_LEVELS[level])
        colors.push(color.r, color.g, color.b)
      }
      // Girar la diagonal evita manchas en las esquinas sombreadas
      if (ao[0] + ao[2] >= ao[1] + ao[3]) indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
      else indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  return geometry
}

const VOXEL_SIZE = 0.036
const parts = buildParts()
const material = new THREE.MeshLambertMaterial({ vertexColors: true })

function buildModelGeometries(factor: number) {
  const entries = Object.entries(parts).map(([name, part]) => {
    const offset = new Map(part.voxels)
    return [name, buildGeometry(downsample(offset, factor), part.pivot, VOXEL_SIZE, factor)] as const
  })
  return Object.fromEntries(entries) as Record<keyof typeof parts, THREE.BufferGeometry>
}

const geometries = { 1: buildModelGeometries(1), 2: buildModelGeometries(2) }
let factor: 1 | 2 = 1

interface Character { root: THREE.Group; meshes: Record<string, THREE.Mesh>; phase: number }

function createCharacter(phase: number): Character {
  const root = new THREE.Group()
  const meshes: Record<string, THREE.Mesh> = {}
  for (const [name, part] of Object.entries(parts)) {
    const mesh = new THREE.Mesh(geometries[factor][name as keyof typeof parts], material)
    mesh.position.set(part.pivot[0] * VOXEL_SIZE, part.pivot[1] * VOXEL_SIZE, part.pivot[2] * VOXEL_SIZE)
    mesh.castShadow = true
    root.add(mesh)
    meshes[name] = mesh
  }
  return { root, meshes, phase }
}

function setResolution(next: 1 | 2) {
  factor = next
  for (const character of characters) {
    for (const [name, mesh] of Object.entries(character.meshes)) mesh.geometry = geometries[factor][name as keyof typeof parts]
  }
  updateStats()
}

// Escena
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100)
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.append(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a93b5, 1.5))
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2)
sun.position.set(3, 6, 5)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 25 })
sun.shadow.bias = -0.0005
scene.add(sun)

function box(group: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }))
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

const showcase = new THREE.Group()
const studio = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.ShadowMaterial({ opacity: 0.28 }))
studio.rotation.x = -Math.PI / 2
studio.receiveShadow = true
showcase.add(studio)
scene.add(showcase)

const room = new THREE.Group()
const floor = box(room, 12, 0.1, 12, 0, -0.05, 0, 0x45475a)
floor.castShadow = false
box(room, 12, 2.5, 0.3, 0, 1.25, -6, 0x585b70).castShadow = false
box(room, 0.3, 2.5, 12, -6, 1.25, 0, 0x585b70).castShadow = false
box(room, 0.3, 2.5, 12, 6, 1.25, 0, 0x585b70).castShadow = false
scene.add(room)

interface SeatSpot { x: number; z: number; facing: 1 | -1 }
const seats: SeatSpot[] = []
for (const table of [{ x: -3, z: -2.5 }, { x: 3, z: -2.5 }, { x: -3, z: 2.5 }]) {
  box(room, 2.4, 0.05, 1.2, table.x, 0.725, table.z, 0xa6744f)
  for (const [lx, lz] of [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]]) box(room, 0.08, 0.7, 0.08, table.x + lx, 0.35, table.z + lz, 0x74543a)
  for (const offsetX of [-0.6, 0.6]) {
    for (const facing of [1, -1] as const) {
      const x = table.x + offsetX, z = table.z - facing * 1.0
      seats.push({ x, z, facing })
      box(room, 0.5, 0.06, 0.5, x, 0.45, z, 0x74543a)
      box(room, 0.5, 0.5, 0.05, x, 0.72, z - facing * 0.24, 0x74543a)
      box(room, 0.06, 0.45, 0.06, x, 0.22, z, 0x5c4230)
      box(room, 0.34, 0.015, 0.24, x, 0.76, z + facing * 0.42, 0x313244)
      const screen = box(room, 0.34, 0.22, 0.012, x, 0.87, z + facing * 0.56, 0x313244)
      screen.rotation.x = -facing * 0.2
    }
  }
}

const characters: Character[] = []
let mode: 'portrait' | 'room' = 'portrait'
let count = 1

function clearCharacters() {
  for (const character of characters) character.root.removeFromParent()
  characters.length = 0
}

function layout() {
  clearCharacters()
  const isPortrait = mode === 'portrait'
  showcase.visible = isPortrait
  room.visible = !isPortrait
  scene.background = new THREE.Color(isPortrait ? 0x6fb2e0 : 0x181825)

  if (isPortrait) {
    const character = createCharacter(0)
    scene.add(character.root)
    characters.push(character)
    camera.position.set(1.0, 1.15, 3.0)
    controls.target.set(0, 0.85, 0)
  } else {
    for (let i = 0; i < count; i++) {
      const character = createCharacter(i * 1.7)
      const seat = seats[i]
      character.root.position.set(seat.x, -0.04, seat.z)
      character.root.rotation.y = seat.facing > 0 ? 0 : Math.PI
      character.meshes.legL.rotation.x = -Math.PI / 2
      character.meshes.legR.rotation.x = -Math.PI / 2
      character.meshes.armL.rotation.x = -1.25
      character.meshes.armR.rotation.x = -1.25
      scene.add(character.root)
      characters.push(character)
    }
    camera.position.set(0, 8.5, 9.5)
    controls.target.set(0, 0.5, -0.8)
  }
  updateStats()
}

// Interfaz
const statsEl = document.querySelector<HTMLDivElement>('#stats')!
let renderMs = 0
function triangles() {
  const g = geometries[factor]
  return Object.values(g).reduce((sum, geometry) => sum + geometry.index!.count / 3, 0)
}
function updateStats() {
  statsEl.textContent = `${triangles().toLocaleString('es')} triángulos por personaje · ${renderer.info.render.calls} dibujados · ${renderMs.toFixed(1)} ms de CPU por cuadro`
}

function bindGroup(selector: string, handler: (value: string) => void) {
  const buttons = document.querySelectorAll<HTMLButtonElement>(`${selector} button`)
  buttons.forEach((button) => button.addEventListener('click', () => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)))
    handler(button.dataset.value!)
  }))
}
const countRow = document.querySelector<HTMLDivElement>('#count-row')!
bindGroup('#mode', (value) => { mode = value as typeof mode; countRow.hidden = mode === 'portrait'; layout() })
bindGroup('#res', (value) => setResolution(Number(value) as 1 | 2))
bindGroup('#count', (value) => { count = Number(value); layout() })
bindGroup('#shadow', (value) => {
  renderer.shadowMap.enabled = value === 'on'
  sun.castShadow = value === 'on'
  material.needsUpdate = true
  scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true })
})
renderer.shadowMap.enabled = true

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

let last = performance.now(), time = 0, statTick = 0
const samples: number[] = []
function frame(now: number) {
  const delta = Math.min(now - last, 100) / 1000
  last = now
  time += delta

  for (const c of characters) {
    const t = time * 1 + c.phase
    if (mode === 'portrait') {
      c.meshes.armL.rotation.x = Math.sin(t * 1.6) * 0.06
      c.meshes.armR.rotation.x = -Math.sin(t * 1.6) * 0.06
      c.meshes.head.rotation.y = Math.sin(t * 0.7) * 0.18
      c.root.position.y = 0
    } else {
      c.meshes.armL.rotation.x = -1.25 + Math.max(0, Math.sin(t * 13)) * 0.05
      c.meshes.armR.rotation.x = -1.25 + Math.max(0, Math.sin(t * 13 + 2)) * 0.05
      c.meshes.head.rotation.x = 0.16 + Math.sin(t * 0.5) * 0.03
    }
  }

  controls.update()
  const start = performance.now()
  renderer.render(scene, camera)
  renderMs = performance.now() - start
  samples.push(renderMs)
  if (samples.length > 120) samples.shift()
  if (++statTick % 30 === 0) updateStats()
  requestAnimationFrame(frame)
}

;(window as unknown as Record<string, unknown>).__voxelStats = () => ({
  triangulosPorPersonaje: triangles(),
  dibujados: renderer.info.render.calls,
  triangulosEnEscena: renderer.info.render.triangles,
  msCpuPromedio: samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length),
  gpu: (() => { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'desconocida' })(),
})

layout()
requestAnimationFrame(frame)
