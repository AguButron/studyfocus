import * as THREE from 'three'
import type { ActivityKind } from './activity'
import { releaseCameraFocus } from './cameraView'
import { onKeyPress } from './input'
import { findRemotePlayerAt, getRemotePlayerPosition, getRemotePlayerState } from './remotePlayers'
import { camera, renderer } from './scene'

const UPDATE_INTERVAL = 500 // milisegundos
const ACTIVITY_NAMES: Record<ActivityKind, string> = {
  computer: 'En el computador',
  reading: 'Leyendo',
  writing: 'Escribiendo',
}

const card = document.querySelector<HTMLDivElement>('#player-card')!
const nameText = document.querySelector<HTMLElement>('#player-card-name')!
const statusText = document.querySelector<HTMLSpanElement>('#player-card-status')!
const activityText = document.querySelector<HTMLSpanElement>('#player-card-activity')!

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

let selectedId: string | null = null

function findPlayerUnderCursor(event: MouseEvent) {
  const canvas = renderer.domElement.getBoundingClientRect()
  pointer.set(
    ((event.clientX - canvas.left) / canvas.width) * 2 - 1,
    -((event.clientY - canvas.top) / canvas.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)
  return findRemotePlayerAt(raycaster)
}

function renderCard() {
  const state = selectedId ? getRemotePlayerState(selectedId) : null
  if (!state) {
    selectedId = null
    card.hidden = true
    return
  }

  card.hidden = false
  nameText.textContent = state.nickname
  statusText.textContent = !state.isRunning ? 'Temporizador detenido' : state.period === 'study' ? 'Estudiando' : 'En descanso'
  activityText.textContent = state.seatId === null ? 'Caminando por la sala' : ACTIVITY_NAMES[state.activity]
}

function select(id: string | null) {
  selectedId = id
  // Al pasar de una persona a otra, la cámara parte de nuevo desde donde está
  releaseCameraFocus()
  renderCard()
}

export function closePlayerCard() {
  select(null)
}

// Nulo si no hay nadie seleccionado, o si la persona ya se fue
export function getSelectedPlayerPosition() {
  return selectedId ? getRemotePlayerPosition(selectedId) : null
}

export function setUpPlayerCard() {
  const canvas = renderer.domElement

  canvas.addEventListener('click', (event) => select(findPlayerUnderCursor(event)))
  onKeyPress('Escape', closePlayerCard)

  canvas.addEventListener('pointermove', (event) => {
    canvas.style.cursor = findPlayerUnderCursor(event) ? 'pointer' : ''
  })

  // Sigue al día mientras está abierta, y se cierra si la persona se va
  setInterval(renderCard, UPDATE_INTERVAL)
}
