import './style.css'
import { sendPosition } from './network'
import { updateRemotePlayers } from './remotePlayers'
import { player, toggleSit, updatePlayer } from './player'
import { camera, renderer, scene } from './scene'
import { showHome } from './home'
import { createLabel } from './label'
import { onKeyPress } from './input'

const MAX_DELTA = 100 // milisegundos

let lastTime = 0

function loop(now: number) {
  const delta = Math.min(now - lastTime, MAX_DELTA)
  lastTime = now

  updatePlayer(delta)
  sendPosition(player.position.x, player.position.z)
  updateRemotePlayers(delta)

  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}

showHome((nickname) => {
  player.add(createLabel(nickname))
  onKeyPress('KeyE', toggleSit)
  lastTime = performance.now()
  requestAnimationFrame(loop)
})