import * as THREE from 'three'
import { socket } from './network'
import { scene } from './scene'

interface PlayerState {
  id: string
  x: number
  z: number
}

const geometry = new THREE.BoxGeometry(1, 1, 1)
const material = new THREE.MeshStandardMaterial({ color: 0xf38ba8 })

const remotePlayers = new Map<string, THREE.Mesh>()

function addRemotePlayer(state: PlayerState) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(state.x, 0.5, state.z)
  scene.add(mesh)
  remotePlayers.set(state.id, mesh)
}

function removeRemotePlayer(id: string) {
  const mesh = remotePlayers.get(id)
  if (!mesh) return

  scene.remove(mesh)
  remotePlayers.delete(id)
}

socket.on('players:init', (players: PlayerState[]) => {
  for (const id of remotePlayers.keys()) {
    removeRemotePlayer(id)
  }
  players.forEach(addRemotePlayer)
})

socket.on('player:joined', addRemotePlayer)
socket.on('player:left', removeRemotePlayer)

socket.on('player:moved', (state: PlayerState) => {
  const mesh = remotePlayers.get(state.id)
  if (!mesh) return

  mesh.position.x = state.x
  mesh.position.z = state.z
})