import * as THREE from 'three'
import { scene } from './scene'
import { SEATED_Y, type Seat } from './room'
import type { Period } from './timer'

import { getActivity, onActivityChange, type ActivityKind } from './choices'

// La actividad elegida se guarda en choices.ts (sin Three.js); aquí está cómo se ve sobre la mesa
export { getActivity, setActivity, type ActivityKind } from './choices'
// Estudiando mueve las manos; descansando duerme sobre la mesa; detenido se queda quieto
// 'waiting': sentado sin empezar el temporizador, todavía sin nada sobre la mesa; 'idle': en pausa, con sus cosas
export type Pose = 'study' | 'rest' | 'idle' | 'waiting'

const TABLE_TOP = 0.75
const ITEM_Z = -0.86 // metros hacia la mesa desde la silla
const HAND_Z = -0.76

const HAND_COLOR = 0xcdd6f4
const LINE_COLOR = 0x45475a
const SLEEP_COLOR = '#cdd6f4'
const LEAN_ANGLE = 0.5 // radianes hacia la mesa al dormir
const LEAN_DROP = 0.06 // metros que baja el cuerpo al echarse
const LEAN_SPEED = 3 // cuanto mayor, más rápido se echa y se levanta
const Z_COUNT = 3
const Z_CYCLE = 2.4 // segundos que tarda cada "z" en subir y desaparecer

interface Activity {
  group: THREE.Group
  arms: THREE.Object3D[] // al dormir se esconden: los reemplazan los brazos cruzados
  update: (time: number, isActive: boolean) => void
}

export function poseFor(period: Period, isRunning: boolean, isStarted = isRunning): Pose {
  if (!isStarted) return 'waiting'
  if (!isRunning) return 'idle'
  return period === 'study' ? 'study' : 'rest'
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: THREE.ColorRepresentation,
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

function createArm(side: -1 | 1, sleeveColor: THREE.ColorRepresentation) {
  const arm = new THREE.Group()
  addBox(arm, [0.08, 0.04, 0.12], [0, 0, 0], HAND_COLOR)
  addBox(arm, [0.09, 0.07, 0.6], [0, -0.005, 0.36], sleeveColor)
  arm.rotation.y = side * 0.3
  return arm
}

function createComputer(sleeveColor: THREE.ColorRepresentation): Activity {
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

  const leftArm = createArm(-1, sleeveColor)
  const rightArm = createArm(1, sleeveColor)
  leftArm.position.set(-0.09, TABLE_TOP + 0.05, HAND_Z)
  rightArm.position.set(0.09, TABLE_TOP + 0.05, HAND_Z)
  group.add(leftArm, rightArm)

  return {
    group,
    arms: [leftArm, rightArm],
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

function createBook(sleeveColor: THREE.ColorRepresentation): Activity {
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

  const leftArm = createArm(-1, sleeveColor)
  const rightArm = createArm(1, sleeveColor)
  leftArm.position.set(-0.3, TABLE_TOP + 0.05, HAND_Z - 0.04)
  rightArm.position.set(0.3, TABLE_TOP + 0.05, HAND_Z - 0.04)
  group.add(leftArm, rightArm)

  const FLIP_EVERY = 6 // segundos
  const FLIP_TIME = 0.8

  return {
    group,
    arms: [leftArm, rightArm],
    update(time) {
      const elapsed = time % FLIP_EVERY
      const isFlipping = elapsed < FLIP_TIME
      flippingPage.visible = isFlipping
      flipPivot.rotation.z = isFlipping ? (elapsed / FLIP_TIME) * Math.PI : 0
    },
  }
}

function createNotebook(sleeveColor: THREE.ColorRepresentation): Activity {
  const group = new THREE.Group()
  addBox(group, [0.34, 0.016, 0.44], [0, TABLE_TOP + 0.008, ITEM_Z], 0xfaf8f0)

  const firstLineX = -0.14
  const lineWidth = 0.27
  const lineZ = (index: number) => ITEM_Z - 0.17 + index * 0.045

  const lines = Array.from({ length: 8 }, (_, index) =>
    addTextLine(group, lineWidth, firstLineX, TABLE_TOP + 0.018, lineZ(index), LINE_COLOR),
  )

  const leftArm = createArm(-1, sleeveColor)
  leftArm.position.set(-0.27, TABLE_TOP + 0.05, HAND_Z)
  group.add(leftArm)

  const rightArm = createArm(1, sleeveColor)
  group.add(rightArm)

  const pen = addBox(rightArm, [0.012, 0.012, 0.16], [-0.02, 0.03, -0.06], 0x1e1e2e)
  pen.rotation.x = 0.5

  return {
    group,
    arms: [leftArm, rightArm],
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

const activityBuilders: Record<ActivityKind, (sleeveColor: THREE.ColorRepresentation) => Activity> = {
  computer: createComputer,
  reading: createBook,
  writing: createNotebook,
}

export interface ActivityView {
  setKind: (kind: ActivityKind) => void
  showAt: (seat: Seat) => void
  hide: () => void
  update: (delta: number, pose: Pose) => void
  getLean: () => number // de 0 (derecho) a 1 (echado sobre la mesa)
  dispose: () => void
}

// Una sola textura para todas las "z"
let zTexture: THREE.CanvasTexture | null = null

function getZTexture() {
  if (zTexture) return zTexture

  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')!
  context.fillStyle = SLEEP_COLOR
  context.font = 'bold 52px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('z', 32, 34)
  zTexture = new THREE.CanvasTexture(canvas)
  return zTexture
}

// Los brazos cruzados sobre el borde de la mesa, donde apoya la cabeza, y las "z" que suben
function createSleep(sleeveColor: THREE.ColorRepresentation) {
  const group = new THREE.Group()
  group.visible = false

  for (const [side, z, y] of [[-1, -0.68, 0.045], [1, -0.76, 0.06]] as const) {
    const arm = new THREE.Group()
    arm.position.set(0, TABLE_TOP + y, z)
    addBox(arm, [0.5, 0.07, 0.09], [0, 0, 0], sleeveColor)
    addBox(arm, [0.1, 0.04, 0.08], [side * 0.28, 0.005, 0], HAND_COLOR)
    arm.rotation.y = side * 0.12
    group.add(arm)
  }

  const zs = Array.from({ length: Z_COUNT }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: getZTexture(), transparent: true, depthWrite: false }))
    group.add(sprite)
    return sprite
  })

  return {
    group,
    update(time: number) {
      zs.forEach((sprite, index) => {
        const progress = ((time + (index * Z_CYCLE) / Z_COUNT) % Z_CYCLE) / Z_CYCLE
        sprite.position.set(0.25 + progress * 0.25, 1.25 + progress * 0.6, -0.35 + progress * 0.1)
        sprite.scale.setScalar(0.1 + progress * 0.12)
        sprite.material.opacity = Math.min(1, progress * 4, (1 - progress) * 3)
      })
    },
  }
}

// Echa el cuerpo hacia la mesa según cuánto duerme
export function poseBody(body: THREE.Object3D, seat: Seat | null, lean: number) {
  body.rotation.x = seat ? seat.facingZ * LEAN_ANGLE * lean : 0
  if (seat) body.position.y = SEATED_Y - LEAN_DROP * lean
}

// Lo que un personaje tiene sobre la mesa y sus manos. Cada modelo se construye al usarlo por primera vez
export function createActivityView(initialKind: ActivityKind, sleeveColor: THREE.ColorRepresentation): ActivityView {
  const root = new THREE.Group()
  root.visible = false
  scene.add(root)

  const models: Partial<Record<ActivityKind, Activity>> = {}
  let kind = initialKind
  let time = 0
  let sleepTime = 0
  let lean = 0
  // Con el temporizador detenido (por ejemplo, esperando que empiece) no hay nada sobre la mesa
  let isIdle = true
  const sleep = createSleep(sleeveColor)
  root.add(sleep.group)

  function showSleeping(isSleeping: boolean) {
    sleep.group.visible = isSleeping
    for (const arm of getModel(kind).arms) {
      arm.visible = !isSleeping
    }
  }

  function getModel(modelKind: ActivityKind) {
    let model = models[modelKind]
    if (!model) {
      model = activityBuilders[modelKind](sleeveColor)
      models[modelKind] = model
      root.add(model.group)
    }
    return model
  }

  getModel(kind).update(0, false)
  getModel(kind).group.visible = false

  return {
    setKind(newKind) {
      getModel(kind).group.visible = false
      kind = newKind
      const model = getModel(kind)
      model.group.visible = !isIdle
      model.update(time, false)
      showSleeping(sleep.group.visible)
    },
    showAt(seat) {
      root.position.set(seat.x, 0, seat.z)
      // El grupo mira hacia -z: si la mesa queda hacia +z, se gira media vuelta
      root.rotation.y = seat.facingZ > 0 ? Math.PI : 0
      root.visible = true
    },
    hide() {
      root.visible = false
      lean = 0
      showSleeping(false)
    },
    update(delta, pose) {
      if (!root.visible) return

      isIdle = pose === 'waiting' // solo antes de empezar se esconde lo que hay sobre la mesa
      getModel(kind).group.visible = !isIdle

      const isActive = pose === 'study'
      if (isActive) {
        time += delta / 1000
      }
      getModel(kind).update(time, isActive)

      // Se echa de a poco y las "z" aparecen cuando ya está casi dormido
      const target = pose === 'rest' ? 1 : 0
      lean += (target - lean) * (1 - Math.exp(-LEAN_SPEED * (delta / 1000)))
      if (Math.abs(target - lean) < 0.001) lean = target
      if (sleep.group.visible !== lean > 0.5) showSleeping(lean > 0.5)
      if (sleep.group.visible) {
        sleepTime += delta / 1000
        sleep.update(sleepTime)
      }
    },
    getLean() {
      return lean
    },
    dispose() {
      scene.remove(root)
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          object.material.dispose()
        } else if (object instanceof THREE.Sprite) {
          object.material.dispose() // la textura de las "z" se comparte: queda
        }
      })
    },
  }
}

let localView: ActivityView | null = null
onActivityChange((activity) => localView?.setKind(activity))

// Las mangas son del color del personaje, que se sabe al entrar a la sala
export function setUpLocalActivity(sleeveColor: string) {
  localView = createActivityView(getActivity(), sleeveColor)
}

export function showActivityAt(seat: Seat) {
  localView?.showAt(seat)
}

export function hideActivity() {
  localView?.hide()
}

export function updateActivity(delta: number, pose: Pose) {
  localView?.update(delta, pose)
}

export function getActivityLean() {
  return localView?.getLean() ?? 0
}
