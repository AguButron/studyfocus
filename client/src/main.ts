import type { Object3D } from 'three'
import './style.css'
import {
  getActivity,
  getActivityLean,
  hideActivity,
  poseBody,
  poseFor,
  setUpLocalActivity,
  showActivityAt,
  updateActivity,
} from './activity'
import {
  focusCameraOn,
  getChosenCamera,
  jumpToCameraView,
  releaseCameraFocus,
  setCameraView,
  updateCameraView,
  type CameraView,
} from './cameraView'
import { showHome } from './home'
import { onKeyPress } from './input'
import { createLabel } from './label'
import { setUpMusic } from './music'
import { sendPosition, sendStatus } from './network'
import { isNearFreeSeat, onSeatChange, player, restorePlayer, setPlayerCharacter, toggleSit, updatePlayer } from './player'
import { closePlayerCard, getSelectedPlayerPosition, setUpPlayerCard } from './playerCard'
import { updateRemotePlayers } from './remotePlayers'
import { setTallFrontWallVisible, type Seat } from './room'
import { camera, renderer, scene } from './scene'
import { playPeriodSound } from './sound'
import { getTimer, isTimerIdle, onPeriodChange, updateTimer } from './timer'
import { setStudyPanelCompact, setStudyScreenVisible, setUpTimerPanel } from './timerPanel'

const MAX_DELTA = 100 // milisegundos
const SEATED_FRAME_TIME = 1000 / 12 // milisegundos: alcanza para que las manos se vean moverse
const STATUS_INTERVAL = 500 // milisegundos
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

function shareStatus() {
  updateTimer()
  const { period, isRunning, periodId } = getTimer()
  sendStatus({ activity: getActivity(), period, isRunning, periodId })
}

function loop(now: number) {
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

  renderer.render(scene, camera)
}

// Estudiar solo: solo el temporizador y la música, sin dibujar la sala
function startSoloStudy() {
  setUpTimerPanel(() => {})
  setUpMusic()
  onPeriodChange(playPeriodSound)
  setStudyScreenVisible(true)
  shareStatus()
  setInterval(shareStatus, STATUS_INTERVAL)
}

showHome((nickname, character, resumed, isSolo) => {
  if (isSolo) {
    startSoloStudy()
    return
  }

  setPlayerCharacter(character)
  setUpLocalActivity(character.color)
  playerLabel = createLabel(nickname)
  player.add(playerLabel)
  onSeatChange((seat) => (seat ? enterStudyMode(seat) : leaveStudyMode()))
  onKeyPress('KeyE', toggleSit)
  setUpTimerPanel(toggleSit)
  setUpPlayerCard()
  setUpMusic()
  onPeriodChange(playPeriodSound)
  hint.hidden = false
  if (resumed) {
    restorePlayer(resumed)
    jumpToCameraView()
  }
  shareStatus()
  // Fuera del bucle de dibujo, que se detiene al estudiar con la pestaña oculta
  setInterval(shareStatus, STATUS_INTERVAL)
  lastTime = performance.now()
  requestAnimationFrame(loop)
})
