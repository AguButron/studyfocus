import type { Object3D } from 'three'
import { getActivityLean, hideActivity, poseBody, poseFor, setUpLocalActivity, showActivityAt, updateActivity } from './activity'
import { focusCameraOn, getChosenCamera, jumpToCameraView, releaseCameraFocus, setCameraView, updateCameraView, type CameraView } from './cameraView'
import type { Character } from './character'
import { onKeyPress } from './input'
import { createLabel } from './label'
import { sendPosition, type ResumedPlayer } from './network'
import { isNearFreeSeat, onSeatChange, player, restorePlayer, setPlayerCharacter, toggleSit, updatePlayer } from './player'
import { closePlayerCard, getSelectedPlayerPosition, setUpPlayerCard } from './playerCard'
import { updateRemotePlayers } from './remotePlayers'
import { setTallFrontWallVisible, type Seat } from './room'
import { camera, getRenderer, scene, startRenderer, stopRenderer } from './scene'
import { getTimer, isTimerIdle } from './timer'
import { setStudyPanelCompact, setStudyScreenVisible, setUpTimerPanel } from './timerPanel'

// La sala 3D: el personaje, los demás, las cámaras y el dibujo de cada cuadro. Con Three.js, así que se
// descarga aparte, recién al entrar a una sala (el menú y estudiar solo no la necesitan). Al volver al menú
// se libera la memoria de video; para entrar a otra sala la página se recarga, así que no se vuelve a armar.

const MAX_DELTA = 100 // milisegundos
const SEATED_FRAME_TIME = 1000 / 12 // milisegundos: alcanza para que las manos se vean moverse
const MOVE_HINT = 'Muévete con WASD o las flechas y acércate a una silla'
const SIT_HINT = 'Pulsa E para sentarte'

const hud = document.querySelector<HTMLElement>('#hud')!
const hint = document.querySelector<HTMLParagraphElement>('#hint')!

let lastTime = 0
let isSceneMoving = false
let isFocusing = false
let playerLabel: Object3D | null = null
let studySeat: Seat | null = null
let studyView: CameraView | null = null
let isInRoom = false

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
  player.visible = true
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

  if (!isFocusing) {
    updatePlayer(delta)
  }
  sendPosition(player.position.x, player.position.z)
  const isAnyoneMoving = updateRemotePlayers(delta)
  updateStudyView()
  updateFocus()
  isSceneMoving = updateCameraView(delta) || isAnyoneMoving

  const { period, isRunning } = getTimer()
  updateActivity(delta, poseFor(period, isRunning))
  poseBody(player, studySeat, getActivityLean())

  if (!studySeat) {
    hint.textContent = isNearFreeSeat() ? SIT_HINT : MOVE_HINT
  }

  getRenderer()?.render(scene, camera)
}

export function startRoom(nickname: string, character: Character, resumed: ResumedPlayer | null) {
  startRenderer()
  setPlayerCharacter(character)
  setUpLocalActivity(character.color)
  playerLabel = createLabel(nickname)
  player.add(playerLabel)
  onSeatChange((seat) => (seat ? enterStudyMode(seat) : leaveStudyMode()))
  onKeyPress('KeyE', () => {
    if (isInRoom) toggleSit()
  })
  setUpTimerPanel(toggleSit)
  setUpPlayerCard()
  hint.hidden = false
  if (resumed) {
    restorePlayer(resumed)
    jumpToCameraView()
  }
  isInRoom = true
  lastTime = performance.now()
  requestAnimationFrame(loop)
}

// Al volver al menú: deja de dibujar y libera el lienzo y su memoria de video
export function stopRoom() {
  isInRoom = false
  closePlayerCard()
  hint.hidden = true
  setStudyScreenVisible(false)
  stopRenderer()
}

