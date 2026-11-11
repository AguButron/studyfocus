import * as THREE from 'three'
import { getChosenCamera, type CameraKind } from './choices'
import { getActivityLean, poseBody, poseFor, setUpLocalActivity, showActivityAt, updateActivity } from './activity'
import type { Character } from './character'
import { createCharacterModel } from './characterModel'
import { SEATED_Y, type Seat } from './roomLayout'
import { camera, getRenderer, startRenderer, stopRenderer } from './scene'
import { getTimer, isTimerIdle } from './timer'
import { setCameraNames, setStudyScreenVisible, setUpTimerPanel } from './timerPanel'

// Estudiar solo: tu escritorio. No es una pieza completa, solo un rincón: el escritorio contra la ventana,
// la silla, una lámpara, una repisa y una planta. El personaje parte sentado y hace lo que elegiste en el panel.
// Es Three.js como la sala, así que se descarga recién al entrar. Lo que hay en el rincón está en DESK_ITEMS,
// para que más adelante cada persona pueda armar el suyo.

const FRAME_TIME = 1000 / 30 // milisegundos: con menos, el vaivén y los cambios de cámara se ven a saltos
const MAX_DELTA = 100 // milisegundos
const WIDE_SCREEN = 900 // píxeles: en pantallas más angostas el panel va abajo, como en la sala

const FLOOR_COLOR = 0x6b4f3a
const WALL_COLOR = 0x3b3f58
const DESK_COLOR = 0xa6744f
const CHAIR_COLOR = 0x74543a
const BACKGROUND = 0x15161c

// La silla está en el origen y el escritorio queda hacia -z, contra la pared de la ventana
const SEAT: Seat = { id: 0, x: 0, z: 0, facingZ: -1, tableX: 0, tableZ: -1 }
const DESK = { width: 1.8, depth: 0.9, height: 0.75, z: -1 }
const BACK_WALL_Z = -1.6
const LEFT_WALL_X = -2.3
const WALL_HEIGHT = 2.8

// Las vistas: desde dónde mira la cámara y hacia dónde. Mientras pones el temporizador se ve al personaje
// de frente; al estudiar, la tecla C (o el aviso del panel) pasa entre las otras tres, como en la sala
type DeskView = CameraKind | 'front'
const VIEWS: Record<DeskView, { eye: THREE.Vector3; look: THREE.Vector3 }> = {
  // Desde el otro lado de la ventana, por sobre el escritorio, mirándolo a la cara (la pared se esconde)
  front: { eye: new THREE.Vector3(0.15, 1.55, -2.3), look: new THREE.Vector3(0, 1, 0) },
  // De costado y algo arriba: el personaje de lado, el escritorio y la ventana
  table: { eye: new THREE.Vector3(3.3, 2.45, 1.25), look: new THREE.Vector3(-0.35, 0.85, -0.65) },
  // Desde lejos y alto: todo el rincón
  room: { eye: new THREE.Vector3(4.4, 3.5, 3.9), look: new THREE.Vector3(-0.6, 0.8, -0.6) },
  // Con sus ojos: el escritorio, lo que tiene en las manos y la ventana
  desk: { eye: new THREE.Vector3(0, 1.75, 0.05), look: new THREE.Vector3(0, 1.1, -1.6) },
}
const CAMERA_NAMES: Record<CameraKind, string> = { desk: 'Primera persona', table: 'Escritorio', room: 'Habitación' }
const CAMERA_SPEED = 3 // cuanto mayor, más rápido pasa de una vista a otra
const SWAY = 0.05 // metros que se mece la cámara, despacio
const SWAY_PERIOD = 14 // segundos por vaivén

type ItemKind = 'lamp' | 'plant' | 'shelf' | 'mug' | 'rug' | 'books' | 'poster'

// Lo que hay en el rincón y dónde. Más adelante esto puede guardarse por cuenta y editarse
export const DESK_ITEMS: { kind: ItemKind; x: number; z: number; rotation?: number }[] = [
  { kind: 'rug', x: 0, z: 0.2 },
  { kind: 'lamp', x: -0.68, z: -1.22 },
  { kind: 'mug', x: 0.62, z: -0.82 },
  { kind: 'books', x: 0.66, z: -1.25 },
  { kind: 'plant', x: 1.35, z: -1.25 },
  { kind: 'shelf', x: LEFT_WALL_X + 0.16, z: -0.4 },
  { kind: 'poster', x: LEFT_WALL_X + 0.16, z: 0.9 },
]

// Su propia escena, no la de scene.ts: esa tiene la sala completa si ya se descargó, y sus pisos
// se pelearían con este, además de dibujar mesas que no se ven
const deskWorld = new THREE.Scene()
const room = new THREE.Group()
const backWall = new THREE.Group() // la pared de la ventana: se esconde cuando la cámara mira desde afuera
const player = createCharacterModel({ color: '#f5c542' })
let lamp: THREE.PointLight | null = null
let isRunning = false
let lastTime = 0
let swayTime = 0
let panelObserver: ResizeObserver | null = null

function material(color: THREE.ColorRepresentation, emissive?: THREE.ColorRepresentation) {
  const result = new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  if (emissive !== undefined) {
    result.emissive.set(emissive)
    result.emissiveIntensity = 1
  }
  return result
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: THREE.ColorRepresentation,
  emissive?: THREE.ColorRepresentation,
) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, emissive))
  box.position.set(...position)
  parent.add(box)
  return box
}

// El piso, dos paredes en esquina y la ventana con la noche afuera
function buildCorner() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), material(FLOOR_COLOR))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(3.7, 0, 4.4)
  room.add(floor)

  room.add(backWall)
  addBox(backWall, [12, WALL_HEIGHT, 0.2], [3.7, WALL_HEIGHT / 2, BACK_WALL_Z - 0.1], WALL_COLOR)
  addBox(room, [0.2, WALL_HEIGHT, 12], [LEFT_WALL_X - 0.1, WALL_HEIGHT / 2, 4.4], WALL_COLOR)
  // Un zócalo claro, para que se note dónde termina el piso
  addBox(backWall, [12, 0.1, 0.04], [3.7, 0.05, BACK_WALL_Z + 0.02], 0xcdb79e)
  addBox(room, [0.04, 0.1, 12], [LEFT_WALL_X + 0.02, 0.05, 4.4], 0xcdb79e)

  // La ventana: el cielo de noche, una luna y algunas estrellas, con su marco
  const windowGroup = new THREE.Group()
  windowGroup.position.set(0, 1.75, BACK_WALL_Z + 0.01)
  backWall.add(windowGroup)
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1), new THREE.MeshBasicMaterial({ color: 0x1d2a4f }))
  windowGroup.add(sky)
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), new THREE.MeshBasicMaterial({ color: 0xf3ead2 }))
  moon.position.set(0.42, 0.25, 0.005)
  windowGroup.add(moon)
  for (const [x, y] of [[-0.55, 0.32], [-0.3, 0.12], [-0.1, 0.36], [0.15, 0.2], [0.6, -0.05], [-0.45, -0.2], [0.3, -0.3]]) {
    addBox(windowGroup, [0.018, 0.018, 0.002], [x, y, 0.004], 0xffffff, 0xffffff)
  }
  const frame = 0xe9e0d0
  addBox(windowGroup, [1.62, 0.07, 0.08], [0, 0.53, 0.03], frame)
  addBox(windowGroup, [1.62, 0.07, 0.08], [0, -0.53, 0.03], frame)
  addBox(windowGroup, [0.07, 1.1, 0.08], [-0.78, 0, 0.03], frame)
  addBox(windowGroup, [0.07, 1.1, 0.08], [0.78, 0, 0.03], frame)
  addBox(windowGroup, [0.04, 1, 0.05], [0, 0, 0.03], frame)
  addBox(windowGroup, [1.75, 0.05, 0.18], [0, -0.58, 0.08], frame) // el alféizar

  // La luz fría de la noche entra por la ventana
  const moonlight = new THREE.DirectionalLight(0x8fa6ff, 0.6)
  moonlight.position.set(0.5, 2.2, BACK_WALL_Z - 1)
  moonlight.target.position.set(0, 0.6, 0)
  room.add(moonlight, moonlight.target)
}

function buildDesk() {
  const top = DESK.height
  addBox(room, [DESK.width, 0.05, DESK.depth], [0, top - 0.025, DESK.z], DESK_COLOR)
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      addBox(room, [0.06, top - 0.05, 0.06], [x * (DESK.width / 2 - 0.06), (top - 0.05) / 2, DESK.z + z * (DESK.depth / 2 - 0.06)], CHAIR_COLOR)
    }
  }
  // Un cajón a la derecha, bajo la cubierta
  addBox(room, [0.45, 0.14, DESK.depth - 0.1], [DESK.width / 2 - 0.3, top - 0.12, DESK.z], 0x8f6243)
  addBox(room, [0.1, 0.02, 0.02], [DESK.width / 2 - 0.3, top - 0.12, DESK.z + DESK.depth / 2 - 0.04], 0xe9e0d0)
}

// La silla queda bajo el personaje (un cubo de 1 metro sentado a SEATED_Y), con su respaldo detrás
function buildChair() {
  const seatTop = SEATED_Y - 0.5
  addBox(room, [0.62, 0.06, 0.62], [SEAT.x, seatTop - 0.03, SEAT.z], CHAIR_COLOR)
  addBox(room, [0.62, 0.7, 0.06], [SEAT.x, seatTop + 0.35, SEAT.z + 0.55], CHAIR_COLOR)
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      addBox(room, [0.05, seatTop - 0.06, 0.05], [SEAT.x + x * 0.26, (seatTop - 0.06) / 2, SEAT.z + z * 0.26], 0x5a4030)
    }
  }
  // Los palos del respaldo hasta el asiento
  for (const x of [-1, 1]) addBox(room, [0.05, 0.3, 0.05], [SEAT.x + x * 0.26, seatTop + 0.1, SEAT.z + 0.55], 0x5a4030)
}

function buildItem({ kind, x, z, rotation = 0 }: (typeof DESK_ITEMS)[number]) {
  const item = new THREE.Group()
  item.position.set(x, 0, z)
  item.rotation.y = rotation
  room.add(item)
  const top = DESK.height

  if (kind === 'rug') {
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), material(0xc86b5a))
    rug.rotation.x = -Math.PI / 2
    rug.position.y = 0.005
    item.add(rug)
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.82, 40), material(0xf0d9b5))
    inner.rotation.x = -Math.PI / 2
    inner.position.y = 0.007
    item.add(inner)
  } else if (kind === 'lamp') {
    // Una lámpara de escritorio con su luz cálida: es la que ilumina el rincón
    addBox(item, [0.18, 0.03, 0.18], [0, top + 0.015, 0], 0x2b2d3a)
    const arm = addBox(item, [0.025, 0.42, 0.025], [0.04, top + 0.22, 0.03], 0x2b2d3a)
    arm.rotation.z = -0.25
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.14, 20, 1, true), material(0xf2b24c))
    shade.material.side = THREE.DoubleSide
    shade.position.set(0.12, top + 0.43, 0.08)
    shade.rotation.z = -0.5
    item.add(shade)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }))
    bulb.position.set(0.14, top + 0.39, 0.08)
    item.add(bulb)
    lamp = new THREE.PointLight(0xffb86b, 3.5, 5, 1.6)
    lamp.position.set(0.16, top + 0.36, 0.1)
    item.add(lamp)
  } else if (kind === 'mug') {
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 16), material(0xf2efe6))
    mug.position.y = top + 0.05
    item.add(mug)
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), material(0x4a2f22))
    coffee.rotation.x = -Math.PI / 2
    coffee.position.y = top + 0.092
    item.add(coffee)
    addBox(item, [0.02, 0.06, 0.04], [0.055, top + 0.05, 0], 0xf2efe6)
  } else if (kind === 'books') {
    const colors = [0x8e4ec6, 0x2f9e5f, 0xe5484d, 0x3e63dd]
    colors.forEach((color, index) => {
      const book = addBox(item, [0.24, 0.045, 0.17], [0, top + 0.0225 + index * 0.045, 0], color)
      book.rotation.y = (index % 2 ? 1 : -1) * 0.12
    })
  } else if (kind === 'plant') {
    addBox(item, [0.3, 0.32, 0.3], [0, 0.16, 0], 0xd9825b)
    addBox(item, [0.26, 0.02, 0.26], [0, 0.32, 0], 0x4a2f22)
    const leaves: [number, number, number, number][] = [
      [0, 0.62, 0, 0.2], [-0.12, 0.5, 0.06, 0.15], [0.12, 0.54, -0.05, 0.15], [0.03, 0.82, 0.04, 0.13], [-0.06, 0.72, -0.08, 0.12],
    ]
    for (const [lx, ly, lz, size] of leaves) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), material(0x3f8f4f))
      leaf.position.set(lx, ly, lz)
      item.add(leaf)
    }
  } else if (kind === 'shelf') {
    // Una repisa en la pared, con libros y una velita
    addBox(item, [0.26, 0.04, 1.1], [0, 1.45, 0], DESK_COLOR)
    const colors = [0xe5484d, 0xf2b24c, 0x3e63dd, 0x2f9e5f, 0xe9e0d0, 0x8e4ec6]
    colors.forEach((color, index) => {
      const height = 0.22 + (index % 3) * 0.04
      addBox(item, [0.18, height, 0.06], [0, 1.47 + height / 2, -0.42 + index * 0.075], color)
    })
    addBox(item, [0.08, 0.1, 0.08], [0, 1.52, 0.35], 0xf2efe6)
    addBox(item, [0.012, 0.03, 0.012], [0, 1.585, 0.35], 0xffd38a, 0xffb347)
  } else if (kind === 'poster') {
    addBox(item, [0.02, 0.8, 0.6], [0, 1.55, 0], 0xf0d9b5)
    addBox(item, [0.022, 0.32, 0.32], [0, 1.62, 0], 0xe5484d)
    addBox(item, [0.024, 0.04, 0.36], [0, 1.3, 0], 0x2b2d3a)
  }
}

let isBuilt = false

// Se arma una sola vez: al volver a entrar ya está
function buildScene() {
  if (isBuilt) return
  isBuilt = true
  buildCorner()
  buildDesk()
  buildChair()
  for (const item of DESK_ITEMS) buildItem(item)
  deskWorld.add(room)
  player.position.set(SEAT.x, SEATED_Y, SEAT.z)
  deskWorld.add(player)
  deskWorld.background = new THREE.Color(BACKGROUND)
  // Es de noche: una luz general tenue, y la que manda es la lámpara
  deskWorld.add(new THREE.AmbientLight(0xffffff, 0.35))
  const fill = new THREE.DirectionalLight(0xffffff, 0.5)
  fill.position.set(3, 5, 4)
  deskWorld.add(fill)
}

let cameraDistance = 1 // más lejos en pantallas angostas, para que entre el rincón

// El panel del temporizador tapa la izquierda (pantallas anchas) o la parte de abajo (angostas): la imagen
// se corre hacia el lado libre, así el personaje queda al centro de lo que sí se ve
function fitToPanel() {
  const panel = document.querySelector<HTMLElement>('#study-panel')?.getBoundingClientRect()
  const width = window.innerWidth
  const height = window.innerHeight
  const isWide = width >= WIDE_SCREEN
  const coveredLeft = isWide && panel ? panel.width : 0
  const coveredBottom = !isWide && panel ? Math.max(0, Math.min(height, height - panel.top)) : 0
  camera.aspect = width / height
  if (coveredLeft > 0 || coveredBottom > 0) camera.setViewOffset(width, height, -coveredLeft / 2, coveredBottom / 2, width, height)
  else camera.clearViewOffset()
  camera.updateProjectionMatrix()
  // Con el panel abajo se ve solo la parte de arriba: la cámara se aleja para que entre el rincón
  cameraDistance = THREE.MathUtils.clamp(Math.pow(height / Math.max(1, height - coveredBottom), 0.6), 1, 2)
}

const currentEye = new THREE.Vector3()
const currentLook = new THREE.Vector3()
const targetEye = new THREE.Vector3()

function currentView(): DeskView {
  return isTimerIdle() ? 'front' : getChosenCamera()
}

// Dónde va la cámara en esta vista. En pantallas angostas se aleja, salvo con sus ojos
function aimTarget(view: DeskView) {
  const { eye, look } = VIEWS[view]
  const distance = view === 'desk' ? 1 : cameraDistance
  targetEye.copy(eye).sub(look).multiplyScalar(distance).add(look)
  return look
}

// Va de a poco hacia la vista que toca; jump la pone de una, al entrar
function placeCamera(delta: number, jump = false) {
  const view = currentView()
  player.visible = view !== 'desk' // con sus ojos no se ve su propio cubo, como en la sala
  const look = aimTarget(view)
  const factor = jump ? 1 : 1 - Math.exp(-CAMERA_SPEED * (delta / 1000))
  currentEye.lerp(targetEye, factor)
  currentLook.lerp(look, factor)
  // Con sus ojos no puede alejarse: en pantallas angostas abre el ángulo, para que se vea algo más que la ventana
  const zoom = view === 'desk' ? 1 / cameraDistance : 1
  if (Math.abs(camera.zoom - zoom) > 0.001) {
    camera.zoom += (zoom - camera.zoom) * factor
    camera.updateProjectionMatrix()
  }

  const angle = (swayTime / SWAY_PERIOD) * Math.PI * 2
  const sway = view === 'desk' ? SWAY * 0.3 : SWAY // con sus ojos, apenas: como respirar
  camera.position.copy(currentEye)
  camera.position.x += Math.sin(angle) * sway
  camera.position.y += Math.sin(angle * 2) * sway * 0.3
  camera.lookAt(currentLook)
  backWall.visible = camera.position.z > BACK_WALL_Z // desde afuera, la pared taparía todo
}

function loop(now: number) {
  if (!isRunning) return
  requestAnimationFrame(loop)
  // Con la pestaña oculta el navegador ya detiene este bucle; visible, basta con pocos cuadros
  if (now - lastTime < FRAME_TIME) return
  const delta = Math.min(now - lastTime, MAX_DELTA)
  lastTime = now

  swayTime += delta / 1000
  placeCamera(delta)
  const { period, isRunning: isTimerRunning } = getTimer()
  updateActivity(delta, poseFor(period, isTimerRunning, !isTimerIdle()))
  poseBody(player, SEAT, getActivityLean())
  // La lámpara titila apenas, como una luz de verdad
  if (lamp) lamp.intensity = 3.5 + Math.sin(now / 900) * 0.08

  getRenderer()?.render(deskWorld, camera)
}

export function startDesk(character: Character) {
  startRenderer()
  buildScene()
  ;(player.material as THREE.MeshStandardMaterial).color.set(character.color)
  setUpLocalActivity(character.color, deskWorld)
  showActivityAt(SEAT)
  setUpTimerPanel(() => {}) // no hay otro asiento al que cambiarse
  setCameraNames(CAMERA_NAMES)
  document.querySelector<HTMLElement>('#hud')!.hidden = true // el panel lleva el logo para volver al menú
  setStudyScreenVisible(true)

  fitToPanel()
  window.addEventListener('resize', fitToPanel)
  const panel = document.querySelector<HTMLElement>('#study-panel')
  if (panel) {
    panelObserver = new ResizeObserver(fitToPanel)
    panelObserver.observe(panel)
  }
  placeCamera(0, true)
  isRunning = true
  lastTime = performance.now() - FRAME_TIME
  requestAnimationFrame(loop)
}

// Al volver al menú: deja de dibujar y libera el lienzo y su memoria de video
export function stopDesk() {
  isRunning = false
  window.removeEventListener('resize', fitToPanel)
  panelObserver?.disconnect()
  panelObserver = null
  camera.clearViewOffset()
  camera.zoom = 1 // la cámara es la misma de la sala
  camera.updateProjectionMatrix()
  setCameraNames(null)
  setStudyScreenVisible(false)
  stopRenderer()
}
