import type { Object3D } from 'three'
import { getActivityLean, hideActivity, poseBody, poseFor, setUpLocalActivity, showActivityAt, updateActivity } from './activity'
import { focusCameraOn, getChosenCamera, jumpToCameraView, releaseCameraFocus, setCameraView, updateCameraView, type CameraView } from './cameraView'
import type { Character } from './character'
import * as THREE from 'three'
import { createLabel } from './label'
import type { ResumedPlayer } from './network'
import { changeSeat, isSeated, onSeatChange, pickSeat, player, restorePlayer, setPlayerCharacter } from './player'
import { closePlayerCard, getSelectedPlayerPosition, setUpPlayerCard } from './playerCard'
import { isSeatTaken, reseatRemotePlayers, updateRemotePlayers } from './remotePlayers'
import { buildRoom, findChairAt, highlightChairs, seats, setTallFrontWallVisible, type Seat } from './room'
import { camera, getRenderer, scene, startRenderer, stopRenderer } from './scene'
import { isSoftwareRendering } from './gpuCheck'
import { getTimer, isTimerIdle } from './timer'
import { setStudyPanelCompact, setStudyScreenVisible, setUpTimerPanel } from './timerPanel'

// La sala 3D: el personaje, los demás, las cámaras y el dibujo de cada cuadro. Con Three.js, así que se
// descarga aparte, recién al entrar a una sala (el menú y estudiar solo no la necesitan). Al volver al menú
// se libera la memoria de video; para entrar a otra sala la página se recarga, así que no se vuelve a armar.

const MAX_DELTA = 100 // milisegundos
const SEATED_FRAME_TIME = 1000 / 12 // milisegundos: alcanza para que las manos se vean moverse
const CHOOSE_HINT = 'Haz clic en una silla libre para sentarte'
const FULL_HINT = 'No quedan sillas libres en esta sala'

const hud = document.querySelector<HTMLElement>('#hud')!
const hint = document.querySelector<HTMLParagraphElement>('#hint')!
const gpuNotice = document.querySelector<HTMLDivElement>('#gpu-notice')!
const GPU_NOTICE_KEY = 'studyfocus.gpuNoticeSeen' // una vez por pestaña, para no repetirlo en cada sala

// Sin la tarjeta gráfica la sala va lenta, y con YouTube encima salen cuadros negros: se avisa cómo arreglarlo
function showGpuNotice() {
  let seen = false
  try {
    seen = sessionStorage.getItem(GPU_NOTICE_KEY) === 'true'
  } catch {
    // Sin almacenamiento se muestra igual
  }
  if (seen || !isSoftwareRendering(getRenderer()?.getContext())) return
  gpuNotice.hidden = false
  document.querySelector('#gpu-notice-close')!.addEventListener(
    'click',
    () => {
      gpuNotice.hidden = true
      try {
        sessionStorage.setItem(GPU_NOTICE_KEY, 'true')
      } catch {
        // Sin almacenamiento, vuelve a aparecer en la próxima sala
      }
    },
    { once: true },
  )
}

let lastTime = 0
let isSceneMoving = false
let isFocusing = false
let playerLabel: Object3D | null = null
let studySeat: Seat | null = null
let studyView: CameraView | null = null
let isInRoom = false
let hoveredSeatId: number | null = null

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

// La silla libre bajo el mouse, mientras se está eligiendo asiento
function findFreeSeatUnderCursor(event: MouseEvent) {
  const renderer = getRenderer()
  if (!renderer || isSeated()) return null
  const canvas = renderer.domElement.getBoundingClientRect()
  pointer.set(((event.clientX - canvas.left) / canvas.width) * 2 - 1, -((event.clientY - canvas.top) / canvas.height) * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  const seat = findChairAt(raycaster)
  return seat && !isSeatTaken(seat.id) ? seat : null
}

function setUpSeatPicker() {
  const canvas = getRenderer()!.domElement
  canvas.addEventListener('pointermove', (event) => {
    const seat = findFreeSeatUnderCursor(event)
    hoveredSeatId = seat?.id ?? null
    if (seat) canvas.style.cursor = 'pointer' // la tarjeta de personas deja el cursor normal si no hay nadie
  })
  canvas.addEventListener('pointerleave', () => (hoveredSeatId = null))
  canvas.addEventListener('click', async (event) => {
    const seat = findFreeSeatUnderCursor(event)
    if (!seat) return
    hoveredSeatId = null
    if (!(await pickSeat(seat))) hint.textContent = 'Alguien tomó esa silla justo antes. Elige otra.'
  })
}

// Mientras se elige, las sillas libres se iluminan y el aviso dice qué hacer
function updateSeatChoice() {
  if (studySeat) {
    highlightChairs(null, null)
    return
  }
  const free = new Set(seats.filter((seat) => !isSeatTaken(seat.id)).map((seat) => seat.id))
  if (hoveredSeatId !== null && !free.has(hoveredSeatId)) hoveredSeatId = null
  highlightChairs(free, hoveredSeatId)
  if (!hint.textContent?.startsWith('Alguien') || free.size === 0) hint.textContent = free.size > 0 ? CHOOSE_HINT : FULL_HINT
}

function enterStudyMode(seat: Seat) {
  studySeat = seat
  showActivityAt(seat)
  hud.hidden = true
  hint.hidden = true
  setStudyScreenVisible(true)
  updateStudyView()
}

function leaveStudyMode() {
  studySeat = null
  studyView = null
  player.visible = false // sin silla no se ve: se vuelve a elegir desde arriba
  playerLabel!.visible = true
  setTallFrontWallVisible(false)
  setStudyPanelCompact(false)
  hideActivity()
  poseBody(player, null, 0)
  setCameraView('room', null)
  hud.hidden = false
  hint.hidden = false
  setStudyScreenVisible(false)
}

// Mientras se eligen los minutos se ve al personaje; al comenzar, manda la cámara elegida
function updateStudyView() {
  if (!studySeat) return

  const view = isTimerIdle() ? 'front' : getChosenCamera()
  if (view === studyView) return

  // Elegir otra cámara o comenzar una sesión termina el zoom
  closePlayerCard()
  studyView = view
  player.visible = view !== 'desk'
  playerLabel!.visible = view !== 'front' // tan cerca, el apodo tapa la vista
  setTallFrontWallVisible(view !== 'room')
  setStudyPanelCompact(view !== 'front')
  setCameraView(view, studySeat)
}

function updateFocus() {
  const target = getSelectedPlayerPosition()
  if (target) {
    focusCameraOn(target)
  } else if (isFocusing) {
    releaseCameraFocus()
    setCameraView(studyView ?? 'room', studySeat)
  }
  isFocusing = target !== null
}

function loop(now: number) {
  if (!isInRoom) return
  requestAnimationFrame(loop)

  // Con la pestaña oculta el navegador ya detiene este bucle; sentado, basta con dibujar menos
  if (studySeat && !isSceneMoving && now - lastTime < SEATED_FRAME_TIME) return

  const delta = Math.min(now - lastTime, MAX_DELTA)
  lastTime = now

  updateSeatChoice()
  const isAnyoneMoving = updateRemotePlayers(delta)
  updateStudyView()
  updateFocus()
  isSceneMoving = updateCameraView(delta) || isAnyoneMoving

  const { period, isRunning } = getTimer()
  updateActivity(delta, poseFor(period, isRunning, !isTimerIdle()))
  poseBody(player, studySeat, getActivityLean())

  getRenderer()?.render(scene, camera)
}

// kind: el tipo de sala, que decide su tamaño, sus mesas y su decoración
export function startRoom(nickname: string, character: Character, resumed: ResumedPlayer | null, kind: string) {
  buildRoom(kind)
  reseatRemotePlayers()
  setCameraView('room', null)
  jumpToCameraView()
  startRenderer()
  setPlayerCharacter(character)
  setUpLocalActivity(character.color)
  playerLabel = createLabel(nickname)
  player.add(playerLabel)
  onSeatChange((seat) => (seat ? enterStudyMode(seat) : leaveStudyMode()))
  setUpTimerPanel(changeSeat)
  setUpPlayerCard()
  setUpSeatPicker()
  hint.textContent = CHOOSE_HINT
  hint.hidden = false
  if (resumed) {
    restorePlayer(resumed)
    jumpToCameraView()
  }
  isInRoom = true
  lastTime = performance.now()
  requestAnimationFrame(loop)
  showGpuNotice()
}

// Al volver al menú: deja de dibujar y libera el lienzo y su memoria de video
export function stopRoom() {
  isInRoom = false
  closePlayerCard()
  hint.hidden = true
  gpuNotice.hidden = true
  setStudyScreenVisible(false)
  stopRenderer()
}

