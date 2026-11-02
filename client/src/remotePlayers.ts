import * as THREE from 'three'
import { socket } from './network'
import { scene } from './scene'
import { createLabel, disposeLabel } from './label'
import { SEATED_Y, STANDING_Y } from './room'

interface PlayerState {
  id: string
  nickname: string
  seatId: number | null
  x: number
  z: number
}

const SMOOTHING = 12 // cuanto mayor, más rápido alcanza la posición recibida
const geometry = new THREE.BoxGeometry(1, 1, 1)
const material = new THREE.MeshStandardMaterial({ color: 0xf38ba8 })

interface RemotePlayer {
  mesh: THREE.Mesh
  label: THREE.Sprite
  seatId: number | null
  targetX: number
  targetZ: number
}

const remotePlayers = new Map<string, RemotePlayer>()

function heightFor(seatId: number | null) {
  return seatId === null ? STANDING_Y : SEATED_Y
}

function addRemotePlayer(state: PlayerState) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(state.x, heightFor(state.seatId), state.z)
  scene.add(mesh)
  const label = createLabel(state.nickname)
  mesh.add(label)

  remotePlayers.set(state.id, { mesh, label, seatId: state.seatId, targetX: state.x, targetZ: state.z })
}

function removeRemotePlayer(id: string) {
  const remotePlayer = remotePlayers.get(id)
  if (!remotePlayer) return

  scene.remove(remotePlayer.mesh)
  disposeLabel(remotePlayer.label)
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
  const remotePlayer = remotePlayers.get(state.id)
  if (!remotePlayer) return

  remotePlayer.targetX = state.x
  remotePlayer.targetZ = state.z
})

socket.on('player:seated', (state: PlayerState) => {
  const remotePlayer = remotePlayers.get(state.id)
  if (!remotePlayer) return

  remotePlayer.seatId = state.seatId
  remotePlayer.mesh.position.y = heightFor(state.seatId)
})

export function isSeatTaken(seatId: number) {
  for (const remotePlayer of remotePlayers.values()) {
    if (remotePlayer.seatId === seatId) return true
  }
  return false
}

export function updateRemotePlayers(delta: number) {
  const factor = 1 - Math.exp(-SMOOTHING * (delta / 1000))

  for (const { mesh, targetX, targetZ } of remotePlayers.values()) {
    mesh.position.x += (targetX - mesh.position.x) * factor
    mesh.position.z += (targetZ - mesh.position.z) * factor
  }
}