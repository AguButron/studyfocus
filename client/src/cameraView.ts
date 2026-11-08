import * as THREE from 'three'
import type { Seat } from './room'
import { camera } from './scene'

export type CameraKind = 'desk' | 'table' | 'room'
export type CameraView = CameraKind | 'front'

const STORAGE_KEY = 'studyfocus.camera'
const CAMERAS: CameraKind[] = ['desk', 'table', 'room']

const CAMERA_SPEED = 5 // cuanto mayor, más rápida la transición
const SETTLED_DISTANCE = 0.005 // metros
const SETTLED_ANGLE = 0.002 // radianes
// Alto y algo adelantado, para ver por sobre el computador propio lo que tiene quien está al frente
const EYE_HEIGHT = 1.7
const EYE_FORWARD = 0.3
const DESK_LOOK_HEIGHT = 0.92
const DESK_LOOK_DISTANCE = 1.3
const FOCUS_DISTANCE = 1.8 // metros desde la persona
const FOCUS_MIN_HEIGHT = 1.5
const FOCUS_LOOK_HEIGHT = 1.1 // sobre su centro, para que también se vea su apodo
const FOCUS_ROOM_LIMIT = 5.5 // metros desde el centro: no pasa más allá de las paredes
const TABLE_SIDE_DISTANCE = 4 // desde el centro de la mesa; alcanza sin chocar con las mesas del otro lado
const TABLE_SIDE_HEIGHT = 1.9
const TABLE_SIDE_LOOK_HEIGHT = 0.9
// Sobre el borde lejano de la mesa: más allá estaría dentro de quien se sienta al frente
const FRONT_DISTANCE = 1.75
const FRONT_HEIGHT = 1.5 // por sobre el computador propio
const FRONT_LOOK_HEIGHT = 0.95
const WIDE_SCREEN = 900 // píxeles: en pantallas más angostas el panel va abajo

const targetPosition = new THREE.Vector3()
const targetRotation = new THREE.Quaternion()
const helper = new THREE.PerspectiveCamera() // una cámara mira hacia -z; un objeto común, hacia +z
const focusDirection = new THREE.Vector3()
let isFocused = false

function aimAt(position: THREE.Vector3Like, lookAt: THREE.Vector3Like) {
  helper.position.copy(position)
  helper.lookAt(lookAt.x, lookAt.y, lookAt.z)
  targetPosition.copy(position)
  targetRotation.copy(helper.quaternion)
}

function viewRoom() {
  aimAt({ x: 0, y: 10, z: 10 }, { x: 0, y: 0, z: 0 })
}

function viewFromDesk(seat: Seat) {
  aimAt(
    { x: seat.x, y: EYE_HEIGHT, z: seat.z + EYE_FORWARD * seat.facingZ },
    { x: seat.x, y: DESK_LOOK_HEIGHT, z: seat.z + DESK_LOOK_DISTANCE * seat.facingZ },
  )
}

// Desde el pasillo central, mirando la mesa de costado y hacia la pared
function viewFromTableSide(seat: Seat) {
  const side = seat.tableX < 0 ? 1 : -1
  aimAt(
    { x: seat.tableX + side * TABLE_SIDE_DISTANCE, y: TABLE_SIDE_HEIGHT, z: seat.tableZ },
    { x: seat.tableX, y: TABLE_SIDE_LOOK_HEIGHT, z: seat.tableZ },
  )
}

// Desde el otro lado de la mesa, mirando al personaje a la cara
// Qué parte del ancho tapa el panel del temporizador, que en pantallas anchas va a la izquierda
function coveredWidth() {
  if (window.innerWidth < WIDE_SCREEN) return 0
  const panel = document.querySelector<HTMLElement>('#study-panel')
  return panel ? panel.getBoundingClientRect().width / window.innerWidth : 0
}

// Desde el otro lado de la mesa, mirando al personaje a la cara. La vista gira hacia el panel
// lo justo para que el personaje quede al centro de lo que se ve a su derecha.
function viewFromFront(seat: Seat) {
  const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect
  const sideShift = FRONT_DISTANCE * coveredWidth() * halfWidth
  aimAt(
    { x: seat.x, y: FRONT_HEIGHT, z: seat.z + FRONT_DISTANCE * seat.facingZ },
    { x: seat.x - sideShift * seat.facingZ, y: FRONT_LOOK_HEIGHT, z: seat.z },
  )
}

export function setCameraView(view: CameraView, seat: Seat | null) {
  if (view === 'room' || !seat) {
    viewRoom()
  } else if (view === 'desk') {
    viewFromDesk(seat)
  } else if (view === 'table') {
    viewFromTableSide(seat)
  } else {
    viewFromFront(seat)
  }
}

// Se acerca a la persona desde el lado donde ya estaba la cámara, y la sigue si se mueve
export function focusCameraOn(target: THREE.Vector3) {
  if (!isFocused) {
    focusDirection.copy(camera.position).sub(target).normalize()
    isFocused = true
  }

  aimAt(
    {
      x: THREE.MathUtils.clamp(target.x + focusDirection.x * FOCUS_DISTANCE, -FOCUS_ROOM_LIMIT, FOCUS_ROOM_LIMIT),
      y: Math.max(target.y + focusDirection.y * FOCUS_DISTANCE, FOCUS_MIN_HEIGHT),
      z: THREE.MathUtils.clamp(target.z + focusDirection.z * FOCUS_DISTANCE, -FOCUS_ROOM_LIMIT, FOCUS_ROOM_LIMIT),
    },
    { x: target.x, y: FOCUS_LOOK_HEIGHT, z: target.z },
  )
}

export function releaseCameraFocus() {
  isFocused = false
}

export function updateCameraView(delta: number) {
  const factor = 1 - Math.exp(-CAMERA_SPEED * (delta / 1000))
  camera.position.lerp(targetPosition, factor)
  camera.quaternion.slerp(targetRotation, factor)

  const isMoving =
    camera.position.distanceTo(targetPosition) > SETTLED_DISTANCE || camera.quaternion.angleTo(targetRotation) > SETTLED_ANGLE
  return isMoving
}

export function jumpToCameraView() {
  camera.position.copy(targetPosition)
  camera.quaternion.copy(targetRotation)
}

function loadCamera(): CameraKind {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return CAMERAS.find((kind) => kind === saved) ?? 'desk'
  } catch {
    return 'desk'
  }
}

let chosenCamera = loadCamera()

export function getChosenCamera() {
  return chosenCamera
}

export function chooseCamera(kind: CameraKind) {
  chosenCamera = kind

  try {
    localStorage.setItem(STORAGE_KEY, kind)
  } catch {
    // Sin almacenamiento, la cámara elegida solo dura hasta recargar
  }
}

export function chooseNextCamera() {
  chooseCamera(CAMERAS[(CAMERAS.indexOf(chosenCamera) + 1) % CAMERAS.length])
}

viewRoom()
jumpToCameraView()
