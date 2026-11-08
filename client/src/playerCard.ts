import * as THREE from 'three'
import { loadProfile, type Profile } from './account'
import type { ActivityKind } from './activity'
import { getCharacterPhoto } from './character'
import { releaseCameraFocus } from './cameraView'
import { onKeyPress } from './input'
import { findRemotePlayerAt, getRemotePlayerPosition, getRemotePlayerState } from './remotePlayers'
import { getCountryName, getFlag } from './countries'
import { camera, renderer } from './scene'

const UPDATE_INTERVAL = 500 // milisegundos
const ACTIVITY_NAMES: Record<ActivityKind, string> = {
  computer: 'En el computador',
  reading: 'Leyendo',
  writing: 'Escribiendo',
}

const card = document.querySelector<HTMLDivElement>('#player-card')!
const nameText = document.querySelector<HTMLElement>('#player-card-name')!
const photo = document.querySelector<HTMLImageElement>('#player-card-photo')!
const statusText = document.querySelector<HTMLSpanElement>('#player-card-status')!
const activityText = document.querySelector<HTMLSpanElement>('#player-card-activity')!
const studiesText = document.querySelector<HTMLSpanElement>('#player-card-studies')!
const bioText = document.querySelector<HTMLSpanElement>('#player-card-bio')!

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

let selectedId: string | null = null
let profileRequest = 0 // descarta la respuesta si mientras tanto se eligió a otra persona

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
  // La franja de arriba y el cuadrado toman el color del periodo
  card.dataset.period = state.isRunning ? state.period : 'idle'
  statusText.dataset.presence = state.isRunning ? state.period : 'room'
  nameText.textContent = state.nickname
  const photoUrl = getCharacterPhoto(state.character)
  if (photo.getAttribute('src') !== photoUrl) photo.src = photoUrl
  statusText.textContent = !state.isRunning ? 'Temporizador detenido' : state.period === 'study' ? 'Estudiando' : 'En descanso'
  activityText.textContent = state.seatId === null ? 'Caminando por la sala' : ACTIVITY_NAMES[state.activity]
}

// "Ingeniería en la Universidad de Chile · 🇨🇱 Chile"
function describeStudies({ studies, institution, country }: Profile) {
  const place = studies && institution ? `${studies} en ${institution}` : (studies ?? institution)
  const nationality = country ? `${getFlag(country)} ${getCountryName(country)}` : null
  return [place, nationality].filter(Boolean).join(' · ')
}

function showProfile(profile: Profile | null) {
  const studies = profile ? describeStudies(profile) : ''
  studiesText.textContent = studies
  studiesText.hidden = !studies
  bioText.textContent = profile?.bio ?? ''
  bioText.hidden = !profile?.bio
}

async function loadSelectedProfile() {
  showProfile(null)
  const username = selectedId ? getRemotePlayerState(selectedId)?.username : null
  if (!username) return

  const request = ++profileRequest
  const profile = await loadProfile(username)
  if (request === profileRequest) showProfile(profile)
}

function select(id: string | null) {
  const isNewPerson = id !== selectedId
  selectedId = id
  if (isNewPerson) loadSelectedProfile()
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
