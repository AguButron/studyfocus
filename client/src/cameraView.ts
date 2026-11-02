import * as THREE from 'three'
import type { Seat } from './room'
import { camera } from './scene'

const CAMERA_SPEED = 5 // cuanto mayor, más rápida la transición
const EYE_HEIGHT = 1.28
const LOOK_HEIGHT = 0.82
const LOOK_DISTANCE = 0.85
const SIDE_OFFSET = 0.26 // desplaza la vista para que el panel no tape la mesa
const WIDE_SCREEN = 900 // píxeles

const targetPosition = new THREE.Vector3()
const targetRotation = new THREE.Quaternion()
const helper = new THREE.PerspectiveCamera() // una cámara mira hacia -z; un objeto común, hacia +z

function aimAt(position: THREE.Vector3Like, lookAt: THREE.Vector3Like) {
  helper.position.copy(position)
  helper.lookAt(lookAt.x, lookAt.y, lookAt.z)
  targetPosition.copy(position)
  targetRotation.copy(helper.quaternion)
}

export function viewRoom() {
  aimAt({ x: 0, y: 10, z: 10 }, { x: 0, y: 0, z: 0 })
}

export function viewFromSeat(seat: Seat) {
  const sideOffset = window.innerWidth >= WIDE_SCREEN ? SIDE_OFFSET : 0
  aimAt(
    { x: seat.x, y: EYE_HEIGHT, z: seat.z },
    { x: seat.x + sideOffset * seat.facingZ, y: LOOK_HEIGHT, z: seat.z + LOOK_DISTANCE * seat.facingZ },
  )
}

export function updateCameraView(delta: number) {
  const factor = 1 - Math.exp(-CAMERA_SPEED * (delta / 1000))
  camera.position.lerp(targetPosition, factor)
  camera.quaternion.slerp(targetRotation, factor)
}

viewRoom()
camera.position.copy(targetPosition)
camera.quaternion.copy(targetRotation)
