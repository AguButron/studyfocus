import * as THREE from 'three'
import { socket } from './network'
import { scene } from './scene'
import { createActivityView, type ActivityKind, type ActivityView } from './activity'
import { createLabel, disposeLabel } from './label'
import { SEATED_Y, seats, STANDING_Y } from './room'
import type { Period } from './timer'

interface PlayerState {
  id: string
  nickname: string
  seatId: number | null
  x: number
  z: number
  activity: ActivityKind
  period: Period
  isRunning: boolean
}

const SMOOTHING = 12 // cuanto mayor, más rápido alcanza la posición recibida
const SETTLED_DISTANCE = 0.005 // metros
const COLOR = 0xf38ba8
const geometry = new THREE.BoxGeometry(1, 1, 1)
const material = new THREE.MeshStandardMaterial({ color: COLOR })

interface RemotePlayer {
  mesh: THREE.Mesh
  label: THREE.Sprite
  activity: ActivityView
  state: PlayerState
  seatId: number | null
  isStudying: boolean
  targetX: number
  targetZ: number
}

const remotePlayers = new Map<string, RemotePlayer>()

function heightFor(seatId: number | null) {
  return seatId === null ? STANDING_Y : SEATED_Y
}

function isStudying(state: PlayerState) {
  return state.isRunning && state.period === 'study'
}

function showSeatedActivity(activity: ActivityView, seatId: number | null) {
  if (seatId === null) {
    activity.hide()
  } else {
    activity.showAt(seats[seatId])
  }
}

function addRemotePlayer(state: PlayerState) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(state.x, heightFor(state.seatId), state.z)
  scene.add(mesh)
  const label = createLabel(state.nickname)
  mesh.add(label)

  const activity = createActivityView(state.activity, COLOR)
  showSeatedActivity(activity, state.seatId)

  remotePlayers.set(state.id, {
    mesh,
    label,
    activity,
    state,
    seatId: state.seatId,
    isStudying: isStudying(state),
    targetX: state.x,
    targetZ: state.z,
  })
}

function removeRemotePlayer(id: string) {
  const remotePlayer = remotePlayers.get(id)
  if (!remotePlayer) return

  scene.remove(remotePlayer.mesh)
  disposeLabel(remotePlayer.label)
  remotePlayer.activity.dispose()
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

  remotePlayer.state = state
  remotePlayer.seatId = state.seatId
  remotePlayer.mesh.position.y = heightFor(state.seatId)
  showSeatedActivity(remotePlayer.activity, state.seatId)
})

socket.on('player:status', (state: PlayerState) => {
  const remotePlayer = remotePlayers.get(state.id)
  if (!remotePlayer) return

  remotePlayer.state = state
  remotePlayer.isStudying = isStudying(state)
  remotePlayer.activity.setKind(state.activity)
})

export function findRemotePlayerAt(raycaster: THREE.Raycaster) {
  const players = [...remotePlayers.entries()]
  const [hit] = raycaster.intersectObjects(players.map(([, { mesh }]) => mesh), false)
  return players.find(([, { mesh }]) => mesh === hit?.object)?.[0] ?? null
}

export function getRemotePlayerState(id: string) {
  return remotePlayers.get(id)?.state ?? null
}

export function getRemotePlayerPosition(id: string) {
  return remotePlayers.get(id)?.mesh.position ?? null
}

export function isSeatTaken(seatId: number) {
  for (const remotePlayer of remotePlayers.values()) {
    if (remotePlayer.seatId === seatId) return true
  }
  return false
}

export function updateRemotePlayers(delta: number) {
  const factor = 1 - Math.exp(-SMOOTHING * (delta / 1000))
  let isAnyoneMoving = false

  for (const { mesh, activity, isStudying, targetX, targetZ } of remotePlayers.values()) {
    mesh.position.x += (targetX - mesh.position.x) * factor
    mesh.position.z += (targetZ - mesh.position.z) * factor
    activity.update(delta, isStudying)

    if (Math.hypot(targetX - mesh.position.x, targetZ - mesh.position.z) > SETTLED_DISTANCE) {
      isAnyoneMoving = true
    }
  }

  return isAnyoneMoving
}