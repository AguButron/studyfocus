import * as THREE from 'three'
import { socket } from './network'
import { scene } from './scene'
import { createActivityView, poseBody, poseFor, type ActivityKind, type ActivityView, type Pose } from './activity'
import type { Character } from './character'
import { createCharacterModel, disposeCharacterModel } from './characterModel'
import { createLabel, disposeLabel } from './label'
import { SEATED_Y, seats } from './room'
import type { Period } from './timer'

interface PlayerState {
  id: string
  nickname: string
  username: string | null
  character: Character
  seatId: number | null
  x: number
  z: number
  activity: ActivityKind
  period: Period
  isRunning: boolean
  isStarted?: boolean // si ya empezó su temporizador; las páginas de antes no lo mandan
  subject?: { name: string; code: string | null; color: string } | null // el ramo que estudia, si lo eligió
}

const SMOOTHING = 12 // cuanto mayor, más rápido alcanza la posición recibida
const SETTLED_DISTANCE = 0.005 // metros

interface RemotePlayer {
  mesh: THREE.Mesh
  label: THREE.Sprite
  activity: ActivityView
  state: PlayerState
  seatId: number | null
  pose: Pose
  targetX: number
  targetZ: number
}

const remotePlayers = new Map<string, RemotePlayer>()

// Ya nadie camina: quien tiene silla aparece sentado en ella, y quien aún está eligiendo no se ve
function placeOnSeat(remote: { mesh: THREE.Mesh; targetX: number; targetZ: number }, seatId: number | null) {
  const seat = seatId === null ? null : seats[seatId]
  remote.mesh.visible = seat !== undefined && seat !== null
  if (!seat) return
  remote.mesh.position.set(seat.x, SEATED_Y, seat.z)
  remote.targetX = seat.x
  remote.targetZ = seat.z
}


function showSeatedActivity(activity: ActivityView, seatId: number | null) {
  if (seatId === null) {
    activity.hide()
  } else {
    activity.showAt(seats[seatId])
  }
}

function addRemotePlayer(state: PlayerState) {
  const mesh = createCharacterModel(state.character)
  scene.add(mesh)
  const label = createLabel(state.nickname)
  mesh.add(label)

  const activity = createActivityView(state.activity, state.character.color)
  showSeatedActivity(activity, state.seatId)

  const remote: RemotePlayer = {
    mesh,
    label,
    activity,
    state,
    seatId: state.seatId,
    pose: poseFor(state.period, state.isRunning, state.isStarted ?? state.isRunning),
    targetX: state.x,
    targetZ: state.z,
  }
  placeOnSeat(remote, state.seatId)
  remotePlayers.set(state.id, remote)
}

function removeRemotePlayer(id: string) {
  const remotePlayer = remotePlayers.get(id)
  if (!remotePlayer) return

  scene.remove(remotePlayer.mesh)
  disposeCharacterModel(remotePlayer.mesh)
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


socket.on('player:seated', (state: PlayerState) => {
  const remotePlayer = remotePlayers.get(state.id)
  if (!remotePlayer) return

  remotePlayer.state = state
  remotePlayer.seatId = state.seatId
  placeOnSeat(remotePlayer, state.seatId)
  showSeatedActivity(remotePlayer.activity, state.seatId)
})

socket.on('player:status', (state: PlayerState) => {
  const remotePlayer = remotePlayers.get(state.id)
  if (!remotePlayer) return

  remotePlayer.state = state
  remotePlayer.pose = poseFor(state.period, state.isRunning, state.isStarted ?? state.isRunning)
  remotePlayer.activity.setKind(state.activity)
})

export function findRemotePlayerAt(raycaster: THREE.Raycaster) {
  // Solo los que se ven: quien aún elige silla no tiene dónde apuntarle
  const players = [...remotePlayers.entries()].filter(([, { mesh }]) => mesh.visible)
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

  for (const { mesh, activity, pose, seatId, targetX, targetZ } of remotePlayers.values()) {
    mesh.position.x += (targetX - mesh.position.x) * factor
    mesh.position.z += (targetZ - mesh.position.z) * factor
    activity.update(delta, pose)
    poseBody(mesh, seatId === null ? null : seats[seatId], activity.getLean())

    if (Math.hypot(targetX - mesh.position.x, targetZ - mesh.position.z) > SETTLED_DISTANCE) {
      isAnyoneMoving = true
    }
  }

  return isAnyoneMoving
}