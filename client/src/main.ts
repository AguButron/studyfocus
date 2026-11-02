import './style.css'
import './network'
import { updatePlayer } from './player'
import { camera, renderer, scene } from './scene'

const MAX_DELTA = 100 // milisegundos

let lastTime = performance.now()

function loop(now: number) {
  const delta = Math.min(now - lastTime, MAX_DELTA)
  lastTime = now

  updatePlayer(delta)

  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}

requestAnimationFrame(loop)