import * as THREE from 'three'
import { scene } from './scene'
import type { Seat } from './room'

export type ActivityKind = 'computer' | 'reading' | 'writing'

const STORAGE_KEY = 'studyfocus.activity'
const TABLE_TOP = 0.75
const ITEM_Z = -0.86 // metros hacia la mesa desde la silla
const HAND_Z = -0.76

const SLEEVE_COLOR = 0x89b4fa
const HAND_COLOR = 0xcdd6f4
const LINE_COLOR = 0x45475a

interface Activity {
  group: THREE.Group
  update: (time: number, isActive: boolean) => void
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: number,
) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color }))
  box.position.set(...position)
  parent.add(box)
  return box
}

// El punto de origen de la línea queda a la izquierda, para que crezca solo hacia la derecha
function addTextLine(parent: THREE.Object3D, width: number, x: number, y: number, z: number, color: number) {
  const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.004, 0.012), new THREE.MeshBasicMaterial({ color }))
  line.geometry.translate(width / 2, 0, 0)
  line.position.set(x, y, z)
  parent.add(line)
  return line
}

function createArm(side: -1 | 1) {
  const arm = new THREE.Group()
  addBox(arm, [0.08, 0.04, 0.12], [0, 0, 0], HAND_COLOR)
  addBox(arm, [0.09, 0.07, 0.6], [0, -0.005, 0.36], SLEEVE_COLOR)
  arm.rotation.y = side * 0.3
  return arm
}

function createComputer(): Activity {
  const group = new THREE.Group()
  addBox(group, [0.46, 0.02, 0.32], [0, TABLE_TOP + 0.01, ITEM_Z], 0x313244)

  const screen = new THREE.Group()
  screen.position.set(0, TABLE_TOP + 0.02, ITEM_Z - 0.16)
  screen.rotation.x = -0.2
  group.add(screen)
  addBox(screen, [0.46, 0.3, 0.012], [0, 0.15, 0], 0x313244)

  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ color: 0x1e1e2e }))
  display.position.set(0, 0.15, 0.007)
  screen.add(display)

  const lines = [0.32, 0.24, 0.34, 0.18, 0.28, 0.22].map((width, index) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.012), new THREE.MeshBasicMaterial({ color: 0x89b4fa }))
    line.geometry.translate(width / 2, 0, 0)
    line.position.set(-0.18, 0.25 - index * 0.035, 0.008)
    screen.add(line)
    return line
  })

  const leftArm = createArm(-1)
  const rightArm = createArm(1)
  leftArm.position.set(-0.09, TABLE_TOP + 0.05, HAND_Z)
  rightArm.position.set(0.09, TABLE_TOP + 0.05, HAND_Z)
  group.add(leftArm, rightArm)

  return {
    group,
    update(time, isActive) {
      const progress = (time / 1.2) % lines.length
      lines.forEach((line, index) => {
        line.scale.x = Math.max(0.001, Math.min(1, progress - index))
      })

      leftArm.position.y = TABLE_TOP + 0.05 + (isActive ? Math.max(0, Math.sin(time * 15)) * 0.012 : 0)
      rightArm.position.y = TABLE_TOP + 0.05 + (isActive ? Math.max(0, Math.sin(time * 15 + 2)) * 0.012 : 0)
    },
  }
}

function createBook(): Activity {
  const group = new THREE.Group()
  addBox(group, [0.5, 0.01, 0.34], [0, TABLE_TOP + 0.005, ITEM_Z], 0x45475a)

  for (const side of [-1, 1]) {
    const page = addBox(group, [0.24, 0.025, 0.32], [side * 0.122, TABLE_TOP + 0.024, ITEM_Z], 0xf5f2e8)
    page.rotation.z = side * 0.05

    for (let index = 0; index < 8; index++) {
      addTextLine(group, 0.17, side * 0.122 - 0.085, TABLE_TOP + 0.039, ITEM_Z - 0.12 + index * 0.035, LINE_COLOR)
    }
  }

  const flipPivot = new THREE.Group()
  flipPivot.position.set(0, TABLE_TOP + 0.04, ITEM_Z)
  group.add(flipPivot)
  const flippingPage = addBox(flipPivot, [0.24, 0.002, 0.32], [0.12, 0, 0], 0xfaf8f0)

  const leftArm = createArm(-1)
  const rightArm = createArm(1)
  leftArm.position.set(-0.3, TABLE_TOP + 0.05, HAND_Z - 0.04)
  rightArm.position.set(0.3, TABLE_TOP + 0.05, HAND_Z - 0.04)
  group.add(leftArm, rightArm)

  const FLIP_EVERY = 6 // segundos
  const FLIP_TIME = 0.8

  return {
    group,
    update(time) {
      const elapsed = time % FLIP_EVERY
      const isFlipping = elapsed < FLIP_TIME
      flippingPage.visible = isFlipping
      flipPivot.rotation.z = isFlipping ? (elapsed / FLIP_TIME) * Math.PI : 0
    },
  }
}

function createNotebook(): Activity {
  const group = new THREE.Group()
  addBox(group, [0.34, 0.016, 0.44], [0, TABLE_TOP + 0.008, ITEM_Z], 0xfaf8f0)

  const firstLineX = -0.14
  const lineWidth = 0.27
  const lineZ = (index: number) => ITEM_Z - 0.17 + index * 0.045

  const lines = Array.from({ length: 8 }, (_, index) =>
    addTextLine(group, lineWidth, firstLineX, TABLE_TOP + 0.018, lineZ(index), LINE_COLOR),
  )

  const leftArm = createArm(-1)
  leftArm.position.set(-0.27, TABLE_TOP + 0.05, HAND_Z)
  group.add(leftArm)

  const rightArm = createArm(1)
  group.add(rightArm)

  const pen = addBox(rightArm, [0.012, 0.012, 0.16], [-0.02, 0.03, -0.06], 0x1e1e2e)
  pen.rotation.x = 0.5

  return {
    group,
    update(time, isActive) {
      const progress = (time / 2.5) % lines.length
      const currentLine = Math.floor(progress)
      const lineProgress = progress - currentLine

      lines.forEach((line, index) => {
        line.scale.x = Math.max(0.001, Math.min(1, progress - index))
      })

      const penX = firstLineX + lineWidth * lineProgress
      const wiggle = isActive ? Math.sin(time * 18) * 0.004 : 0
      rightArm.position.set(penX + 0.03, TABLE_TOP + 0.05 + wiggle, lineZ(currentLine) + 0.07)
    },
  }
}

const activities: Record<ActivityKind, Activity> = {
  computer: createComputer(),
  reading: createBook(),
  writing: createNotebook(),
}

const root = new THREE.Group()
root.visible = false
scene.add(root)

for (const { group } of Object.values(activities)) {
  group.visible = false
  root.add(group)
}

function isActivityKind(value: unknown): value is ActivityKind {
  return value === 'computer' || value === 'reading' || value === 'writing'
}

function loadActivity(): ActivityKind {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return isActivityKind(saved) ? saved : 'computer'
  } catch {
    return 'computer'
  }
}

let current = loadActivity()
let time = 0
activities[current].group.visible = true
activities[current].update(0, false)

export function getActivity() {
  return current
}

export function setActivity(activity: ActivityKind) {
  activities[current].group.visible = false
  current = activity
  activities[current].group.visible = true
  activities[current].update(time, false)

  try {
    localStorage.setItem(STORAGE_KEY, activity)
  } catch {
    // Sin almacenamiento, la actividad elegida solo dura hasta recargar
  }
}

export function showActivityAt(seat: Seat) {
  root.position.set(seat.x, 0, seat.z)
  // El grupo mira hacia -z: si la mesa queda hacia +z, se gira media vuelta
  root.rotation.y = seat.facingZ > 0 ? Math.PI : 0
  root.visible = true
}

export function hideActivity() {
  root.visible = false
}

export function updateActivity(delta: number, isActive: boolean) {
  if (!root.visible) return

  if (isActive) {
    time += delta / 1000
  }
  activities[current].update(time, isActive)
}
