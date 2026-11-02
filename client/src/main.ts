import './style.css'
import { sendPosition } from './network'
import './remotePlayers'
import { player, updatePlayer } from './player'
import { camera, renderer, scene } from './scene'

const MAX_DELTA = 100 // milisegundos

let lastTime = performance.now()

function loop(now: number) {
  const delta = Math.min(now - lastTime, MAX_DELTA)
  lastTime = now

  updatePlayer(delta)
  sendPosition(player.position.x, player.position.z)

  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}

requestAnimationFrame(loop)