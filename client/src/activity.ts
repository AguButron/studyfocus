import * as THREE from 'three'
import { scene } from './scene'
import { SEATED_Y, type Seat } from './roomLayout' // no './room': ese arma la sala completa, y el escritorio propio no la usa
import type { Period } from './timer'

import { getActivity, getActivityItem, onActivityChange, type ActivityKind } from './choices'
import { pixelSpot, placeItem, reveal, TABLE_TOP } from './voxel/studyItemMesh'

// La actividad elegida se guarda en choices.ts (sin Three.js); aquí está cómo se ve sobre la mesa
export { getActivity, setActivity, type ActivityKind } from './choices'
// Estudiando mueve las manos; descansando duerme sobre la mesa; detenido se queda quieto
// 'waiting': sentado sin empezar el temporizador, todavía sin nada sobre la mesa; 'idle': en pausa, con sus cosas
export type Pose = 'study' | 'rest' | 'idle' | 'waiting'

const HAND_Z = -0.76

const HAND_COLOR = 0xcdd6f4
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

function createArm(side: -1 | 1, sleeveColor: THREE.ColorRepresentation) {
  const arm = new THREE.Group()
  addBox(arm, [0.08, 0.04, 0.12], [0, 0, 0], HAND_COLOR)
  addBox(arm, [0.09, 0.07, 0.6], [0, -0.005, 0.36], sleeveColor)
  arm.rotation.y = side * 0.3
  return arm
}

function createComputer(sleeveColor: THREE.ColorRepresentation, variant: number): Activity {
  const group = new THREE.Group()
  const { writing } = placeItem(group, 'computer', variant)
  const leftArm = createArm(-1, sleeveColor)
  const rightArm = createArm(1, sleeveColor)
  leftArm.position.set(-0.09, TABLE_TOP + 0.05, HAND_Z)
  rightArm.position.set(0.09, TABLE_TOP + 0.05, HAND_Z)
  group.add(leftArm, rightArm)
  const lineCount = writing?.lineEnds.length ?? 1

  return {
    group,
    arms: [leftArm, rightArm],
    update(time, isActive) {
      if (writing) reveal(writing, (time / 1.2) % lineCount)
      leftArm.position.y = TABLE_TOP + 0.05 + (isActive ? Math.max(0, Math.sin(time * 15)) * 0.012 : 0)
      rightArm.position.y = TABLE_TOP + 0.05 + (isActive ? Math.max(0, Math.sin(time * 15 + 2)) * 0.012 : 0)
    },
  }
}

function createBook(sleeveColor: THREE.ColorRepresentation, variant: number): Activity {
  const group = new THREE.Group()
  const { flipPivot } = placeItem(group, 'reading', variant)
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
      if (!flipPivot) return
      const elapsed = time % FLIP_EVERY
      const isFlipping = elapsed < FLIP_TIME
      flipPivot.visible = isFlipping
      flipPivot.rotation.z = isFlipping ? (elapsed / FLIP_TIME) * Math.PI : 0
    },
  }
}

function createNotebook(sleeveColor: THREE.ColorRepresentation, variant: number): Activity {
  const group = new THREE.Group()
  const { writing } = placeItem(group, 'writing', variant)
  const leftArm = createArm(-1, sleeveColor)
  leftArm.position.set(-0.27, TABLE_TOP + 0.05, HAND_Z)
  group.add(leftArm)
  const rightArm = createArm(1, sleeveColor)
  group.add(rightArm)
  const pen = addBox(rightArm, [0.012, 0.012, 0.16], [-0.02, 0.03, -0.06], 0x1e1e2e)
  pen.rotation.x = 0.5
  const lineCount = writing?.lineEnds.length ?? 1

  return {
    group,
    arms: [leftArm, rightArm],
    update(time, isActive) {
      const last = writing ? reveal(writing, (time / 2.5) % lineCount) : null
      // La mano sigue a la punta de lo que se está escribiendo; al empezar de nuevo, al primer píxel
      const spot = pixelSpot(last ?? writing?.pixels[0] ?? { u: 0, v: 0 })
      const wiggle = isActive ? Math.sin(time * 18) * 0.004 : 0
      rightArm.position.set(spot.x + 0.03, TABLE_TOP + 0.05 + wiggle, spot.z + 0.07)
    },
  }
}

const activityBuilders: Record<ActivityKind, (sleeveColor: THREE.ColorRepresentation, variant: number) => Activity> = {
  computer: createComputer,
  reading: createBook,
  writing: createNotebook,
}

export interface ActivityView {
  setKind: (kind: ActivityKind, variant: number) => void // variant: cuál computador, cuaderno o libro (choices.ts)
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
export function createActivityView(
  initialKind: ActivityKind,
  sleeveColor: THREE.ColorRepresentation,
  parent: THREE.Object3D = scene,
  initialVariant = 0,
): ActivityView {
  const root = new THREE.Group()
  root.visible = false
  parent.add(root)

  const models = new Map<string, Activity>() // por actividad y variante, por ejemplo "computer:2"
  let kind = initialKind
  let variant = initialVariant
  let time = 0
  let sleepTime = 0
  let lean = 0
  // Con el temporizador detenido (por ejemplo, esperando que empiece) no hay nada sobre la mesa
  let isIdle = true
  const sleep = createSleep(sleeveColor)
  root.add(sleep.group)

  function showSleeping(isSleeping: boolean) {
    sleep.group.visible = isSleeping
    for (const arm of getModel().arms) {
      arm.visible = !isSleeping
    }
  }

  function getModel() {
    const key = `${kind}:${variant}`
    let model = models.get(key)
    if (!model) {
      model = activityBuilders[kind](sleeveColor, variant)
      models.set(key, model)
      root.add(model.group)
    }
    return model
  }

  getModel().update(0, false)
  getModel().group.visible = false

  return {
    setKind(newKind, newVariant) {
      getModel().group.visible = false
      kind = newKind
      variant = newVariant
      const model = getModel()
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
      getModel().group.visible = !isIdle

      const isActive = pose === 'study'
      if (isActive) {
        time += delta / 1000
      }
      getModel().update(time, isActive)

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
      root.removeFromParent()
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
onActivityChange((activity) => localView?.setKind(activity, getActivityItem(activity)))

// Las mangas son del color del personaje, que se sabe al entrar a la sala. El escritorio propio tiene
// su propia escena, y la pasa como parent. Al volver a entrar, las manos anteriores se desarman
export function setUpLocalActivity(sleeveColor: string, parent?: THREE.Object3D) {
  localView?.dispose()
  localView = createActivityView(getActivity(), sleeveColor, parent, getActivityItem(getActivity()))
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
