import './style.css'
import { hideActivity, showActivityAt, updateActivity } from './activity'
import { updateCameraView, viewFromSeat, viewRoom } from './cameraView'
import { showHome } from './home'
import { onKeyPress } from './input'
import { createLabel } from './label'
import { sendPosition } from './network'
import { isNearFreeSeat, onSeatChange, player, toggleSit, updatePlayer } from './player'
import { updateRemotePlayers } from './remotePlayers'
import { setTallFrontWallVisible, type Seat } from './room'
import { camera, renderer, scene } from './scene'
import { isStudyRunning } from './timer'
import { setStudyScreenVisible, setUpTimerPanel } from './timerPanel'

const MAX_DELTA = 100 // milisegundos
const MOVE_HINT = 'Muévete con WASD o las flechas y acércate a una silla'
const SIT_HINT = 'Pulsa E para sentarte'

const hud = document.querySelector<HTMLElement>('#hud')!
const hint = document.querySelector<HTMLParagraphElement>('#hint')!

let lastTime = 0
let isStudying = false

function enterStudyMode(seat: Seat) {
  isStudying = true
  player.visible = false
  setTallFrontWallVisible(true)
  showActivityAt(seat)
  viewFromSeat(seat)
  hud.hidden = true
  hint.hidden = true
  setStudyScreenVisible(true)
}

function leaveStudyMode() {
  isStudying = false
  player.visible = true
  setTallFrontWallVisible(false)
  hideActivity()
  viewRoom()
  hud.hidden = false
  hint.hidden = false
  setStudyScreenVisible(false)
}

function loop(now: number) {
  const delta = Math.min(now - lastTime, MAX_DELTA)
  lastTime = now

  updatePlayer(delta)
  sendPosition(player.position.x, player.position.z)
  updateRemotePlayers(delta)
  updateCameraView(delta)

  updateActivity(delta, isStudyRunning())

  if (!isStudying) {
    hint.textContent = isNearFreeSeat() ? SIT_HINT : MOVE_HINT
  }

  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}

showHome((nickname) => {
  player.add(createLabel(nickname))
  onSeatChange((seat) => (seat ? enterStudyMode(seat) : leaveStudyMode()))
  onKeyPress('KeyE', toggleSit)
  setUpTimerPanel(toggleSit)
  hint.hidden = false
  lastTime = performance.now()
  requestAnimationFrame(loop)
})
