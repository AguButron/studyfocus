import * as THREE from 'three'
import { getChosenCamera, type CameraKind } from './choices'
import { getActivityLean, poseBody, poseFor, setUpLocalActivity, showActivityAt, updateActivity } from './activity'
import type { Character } from './character'
import { createCharacterModel } from './characterModel'
import { getChosenDesign } from './choices'
import { getRoomLayout, layoutSeats, SEATED_Y, type Seat } from './roomLayout'
import { designsFor, getDesign } from './voxel/designs'
import { buildRoom as buildVoxelRoom, WALL_HEIGHT, type RoomDesign } from './voxel/roomBuilder'
import { SKY_LIGHT, voxelMesh } from './voxel/voxelView'
import { VOXEL_SIZE, VoxelSet } from './voxel/voxels'
import { camera, getRenderer, startRenderer, stopRenderer } from './scene'
import { getTimer, isTimerIdle } from './timer'
import { setCameraNames, setStudyScreenVisible, setUpTimerPanel } from './timerPanel'

// Estudiar solo: tu pieza, con el diseño en cubos del estudio individual que elegiste en Estudiar (ver
// docs/decisiones/0033-arte-en-cubos.md). El personaje parte sentado y hace lo que elegiste en el panel.
// Es Three.js como la sala, así que se descarga recién al entrar.

const FRAME_TIME = 1000 / 30 // milisegundos: con menos, el vaivén y los cambios de cámara se ven a saltos
const MAX_DELTA = 100 // milisegundos
const WIDE_SCREEN = 900 // píxeles: en pantallas más angostas el panel va abajo, como en la sala
const SOLO_KIND = 'solo'
const MAX_LAMPS = 4 // luces de lámparas a la vez, como en la sala

// La silla está en el origen y el escritorio queda hacia -z, contra la pared de la ventana
const SEAT: Seat = { id: 0, x: 0, z: 0, facingZ: -1, tableX: 0, tableZ: -1 }
const VOXEL_SINK = 0.05 // metros, como en room.ts: la cubierta del escritorio queda a 0,75 m, donde va lo de la actividad
const BACK_SLAB = 9 // cubos desde la pared de atrás: la pared, la ventana y lo que cuelga de ella

// Las vistas: desde dónde mira la cámara y hacia dónde. Mientras pones el temporizador se ve al personaje
// de frente; al estudiar, la tecla C (o el aviso del panel) pasa entre las otras tres, como en la sala
type DeskView = CameraKind | 'front'
const VIEWS: Record<DeskView, { eye: THREE.Vector3; look: THREE.Vector3 }> = {
  // Desde el otro lado de la ventana y alto, por sobre lo que hay en el escritorio, mirándolo a la cara (la pared se esconde)
  front: { eye: new THREE.Vector3(0.1, 2.4, -1.9), look: new THREE.Vector3(0, 1, 0) },
  // De costado y algo arriba: el personaje de lado, el escritorio y la ventana
  table: { eye: new THREE.Vector3(1.75, 2.15, 1.5), look: new THREE.Vector3(-0.4, 0.8, -0.8) },
  // Desde atrás y alto, por sobre la pared baja de adelante: toda la pieza
  room: { eye: new THREE.Vector3(1.5, 3.6, 3.5), look: new THREE.Vector3(-0.3, 0.5, -0.6) },
  // Con sus ojos: el escritorio, lo que tiene en las manos y la ventana
  desk: { eye: new THREE.Vector3(0, 1.75, 0.05), look: new THREE.Vector3(0, 1.1, -1.6) },
}
const CAMERA_NAMES: Record<CameraKind, string> = { desk: 'Primera persona', table: 'Escritorio', room: 'Habitación' }
const CAMERA_SPEED = 3 // cuanto mayor, más rápido pasa de una vista a otra
const SWAY = 0.05 // metros que se mece la cámara, despacio
const SWAY_PERIOD = 14 // segundos por vaivén

// Su propia escena, no la de scene.ts: esa tiene la sala completa si ya se descargó, y sus pisos
// se pelearían con este, además de dibujar mesas que no se ven
const deskWorld = new THREE.Scene()
const room = new THREE.Group()
const backWall = new THREE.Group() // la pared de la ventana: se esconde cuando la cámara mira desde afuera
const player = createCharacterModel({ color: '#f5c542' })
let isRunning = false
let lastTime = 0
let swayTime = 0
let panelObserver: ResizeObserver | null = null
// Dónde están las paredes, en metros desde la silla: la cámara no pasa por detrás de ellas
let walls = { back: -1.4, left: -2, right: 2, height: 2.5 }

// Tu pieza: el diseño en cubos del estudio individual que elegiste en Estudiar (o el primero), la misma
// pieza de la sala "solo" (roomLayout.ts), movida para que su silla quede en el origen
function chosenDesign() {
  const saved = getChosenDesign(SOLO_KIND)
  return (saved ? getDesign(saved) : null) ?? designsFor(SOLO_KIND)[0]
}

function buildRoom(design: RoomDesign) {
  const built = buildVoxelRoom(design)
  const seat = layoutSeats(getRoomLayout(SOLO_KIND))[0]
  const x0 = -Math.floor(built.width / 2)
  const z0 = -Math.floor(built.depth / 2)

  // La pared de atrás, con la ventana y lo que cuelga de ella, va aparte para esconderla desde afuera
  const back = new VoxelSet()
  const rest = new VoxelSet()
  built.voxels.forEach((x, y, z, color, glow) => (z < z0 + BACK_SLAB ? back : rest).put(x, y, z, color, { glow, jitter: 0 }))
  for (const [set, parent] of [[rest, room], [back, backWall]] as const) {
    const { group } = voxelMesh(set)
    group.position.set(-seat.x, -VOXEL_SINK, -seat.z)
    parent.add(group)
  }
  room.add(backWall)
  walls = {
    back: z0 * VOXEL_SIZE - seat.z,
    left: x0 * VOXEL_SIZE - seat.x,
    right: (x0 + built.width) * VOXEL_SIZE - seat.x,
    height: (WALL_HEIGHT * VOXEL_SIZE) - VOXEL_SINK,
  }

  // La luz del diseño: el cielo según la hora, el sol por la ventana y las lámparas
  const light = SKY_LIGHT[design.theme.sky]
  deskWorld.background = new THREE.Color(light.background)
  room.add(new THREE.HemisphereLight(light.sky, light.ground, light.hemi))
  const sun = new THREE.DirectionalLight(light.sunColor, light.sun)
  sun.position.set(0.5, 3.4, walls.back - 2)
  sun.target.position.set(0, 0.6, 0.4)
  const front = new THREE.DirectionalLight(0xc9d2ff, light.front)
  front.position.set(-1, 4, 4)
  room.add(sun, sun.target, front)
  for (const source of built.lights.slice(0, MAX_LAMPS)) {
    const lamp = new THREE.PointLight(source.color, source.intensity * light.lamp, source.distance, 1.6)
    lamp.position.set((source.x + 0.5) * VOXEL_SIZE - seat.x, (source.y + 0.5) * VOXEL_SIZE - VOXEL_SINK, (source.z + 0.5) * VOXEL_SIZE - seat.z)
    room.add(lamp)
  }
}

let builtDesign: string | null = null

// Se arma al entrar; si elegiste otro diseño desde la última vez, se rehace
function buildScene() {
  const design = chosenDesign()
  if (builtDesign === design.id) return
  builtDesign = design.id
  room.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      ;(object.material as THREE.Material).dispose()
    }
  })
  room.clear()
  backWall.clear()
  buildRoom(design)
  if (!room.parent) {
    deskWorld.add(room)
    player.position.set(SEAT.x, SEATED_Y, SEAT.z)
    deskWorld.add(player)
  }
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
  // En pantallas angostas se aleja: bajo la altura de las paredes, no pasa por detrás de las de los lados
  if (targetEye.y < walls.height) targetEye.x = THREE.MathUtils.clamp(targetEye.x, walls.left + 0.2, walls.right - 0.2)
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
  backWall.visible = camera.position.z > walls.back // desde afuera, la pared taparía todo
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
