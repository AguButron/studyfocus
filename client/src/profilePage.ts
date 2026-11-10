// La página del perfil de una persona: su foto, lo que cuenta de sí, cuánto ha estudiado y si son amigos.
// Se abre con /?perfil=usuario; por ejemplo, desde su nombre en la tarjeta que aparece al hacer clic en ella
// dentro de una sala, en otra pestaña para no salir de la sala.
import type { Character } from './character'
import { createCharacterPhoto } from './character'
import { getCountryName, getFlag } from './countries'
import { describePresence, type Friend } from './friends'
import { formatDuration, renderChart } from './stats'

const PARAM = 'perfil'

type Relation = 'self' | 'friend' | 'sent' | 'received' | 'none'

interface PersonProfile {
  id: string
  name: string
  username: string
  bio: string | null
  studies: string | null
  institution: string | null
  country: string | null
  character: Character
  memberSince: string // YYYY-MM-DD
  stats: { total: number; week: number; streak: number; days: { date: string; seconds: number }[] }
  relation: Relation
  presence: Friend['presence']
  lastSeen: string | null
}

const statusText = document.querySelector<HTMLParagraphElement>('#person-status')!
const content = document.querySelector<HTMLDivElement>('#person-content')!
const photoBox = document.querySelector<HTMLDivElement>('#person-photo')!
const nameText = document.querySelector<HTMLHeadingElement>('#person-name')!
const usernameText = document.querySelector<HTMLSpanElement>('#person-username')!
const presenceText = document.querySelector<HTMLSpanElement>('#person-presence')!
const sinceText = document.querySelector<HTMLSpanElement>('#person-since')!
const friendButton = document.querySelector<HTMLButtonElement>('#person-friend')!
const cancelButton = document.querySelector<HTMLButtonElement>('#person-friend-cancel')!
const joinButton = document.querySelector<HTMLButtonElement>('#person-join')!
const messageText = document.querySelector<HTMLParagraphElement>('#person-message')!
const aboutTitle = document.querySelector<HTMLHeadingElement>('#person-about-title')!
const studiesText = document.querySelector<HTMLParagraphElement>('#person-studies')!
const bioText = document.querySelector<HTMLParagraphElement>('#person-bio')!
const aboutEmpty = document.querySelector<HTMLParagraphElement>('#person-about-empty')!
const weekText = document.querySelector<HTMLElement>('#person-week')!
const streakText = document.querySelector<HTMLElement>('#person-streak')!
const totalText = document.querySelector<HTMLElement>('#person-total')!
const chart = document.querySelector<HTMLDivElement>('#person-chart')!

const sinceFormat = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone: 'UTC' })

let current: PersonProfile | null = null
let request = 0 // descarta la respuesta de un perfil que ya no está abierto
let actions = { joinRoom: (_code: string) => {}, editOwnProfile: () => {} }

// El link a la página del perfil de alguien
export function profileUrl(username: string) {
  const url = new URL('/', window.location.origin)
  url.searchParams.set(PARAM, username)
  return url.toString()
}

// El usuario de la página que se pidió al abrir, si viene en la dirección
export function readProfileParam() {
  return new URLSearchParams(window.location.search).get(PARAM)
}

// Al ir a otra sección, la dirección deja de apuntar al perfil
export function clearProfileParam() {
  request++ // un perfil que aún se estaba cargando ya no se muestra
  document.title = 'StudyFocus'
  const url = new URL(window.location.href)
  if (!url.searchParams.has(PARAM)) return
  url.searchParams.delete(PARAM)
  window.history.replaceState(null, '', url)
}

async function fetchProfile(username: string): Promise<PersonProfile | { error: string }> {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const response = await fetch(`/api/perfil?usuario=${encodeURIComponent(username)}&tz=${encodeURIComponent(timeZone)}`)
    const result = await response.json()
    return response.ok ? result : { error: result.error ?? 'No se pudo cargar el perfil.' }
  } catch {
    return { error: 'No se pudo conectar con el servidor.' }
  }
}

// "Ingeniería en la Universidad de Chile · 🇨🇱 Chile"
function describeStudies({ studies, institution, country }: PersonProfile) {
  const place = studies && institution ? `${studies} en ${institution}` : (studies ?? institution)
  const nationality = country ? `${getFlag(country)} ${getCountryName(country)}` : null
  return [place, nationality].filter(Boolean).join(' · ')
}

// El botón principal según la relación: agregar, aceptar, la solicitud enviada, ya son amigos, o tu propio perfil
function showRelation(person: PersonProfile) {
  const labels: Record<Relation, string> = {
    none: 'Agregar como amigo',
    received: 'Aceptar su solicitud',
    sent: 'Solicitud enviada',
    friend: 'Son amigos',
    self: 'Editar tu perfil',
  }
  friendButton.textContent = labels[person.relation]
  friendButton.disabled = person.relation === 'sent' || person.relation === 'friend'
  friendButton.classList.toggle('sf-btn--primary', !friendButton.disabled)
  cancelButton.hidden = person.relation !== 'sent'
}

function render(person: PersonProfile) {
  current = person
  photoBox.replaceChildren(createCharacterPhoto(person.character, 'character-photo--large'))
  nameText.textContent = person.name
  usernameText.textContent = `@${person.username}`
  sinceText.textContent = `En StudyFocus desde ${sinceFormat.format(new Date(`${person.memberSince}T12:00:00Z`))}`
  document.title = `${person.name} · StudyFocus`

  // Dónde está ahora: solo lo ven sus amigos
  const presence = person.relation === 'friend' ? describePresence(person) : null
  presenceText.hidden = !presence
  presenceText.textContent = presence?.text ?? ''
  if (presence) presenceText.dataset.presence = presence.kind
  joinButton.hidden = !(person.relation === 'friend' && person.presence?.code)
  showRelation(person)

  aboutTitle.textContent = person.relation === 'self' ? 'Sobre ti' : `Sobre ${person.name}`
  const studies = describeStudies(person)
  studiesText.textContent = studies
  studiesText.hidden = !studies
  bioText.textContent = person.bio ?? ''
  bioText.hidden = !person.bio
  aboutEmpty.hidden = Boolean(studies || person.bio)
  aboutEmpty.textContent = person.relation === 'self' ? 'Aún no cuentas nada sobre ti.' : 'Aún no ha contado nada sobre sí.'

  weekText.textContent = formatDuration(person.stats.week)
  streakText.textContent = `${person.stats.streak} ${person.stats.streak === 1 ? 'día' : 'días'}`
  totalText.textContent = formatDuration(person.stats.total)
  renderChart(person.stats.days, chart)

  content.hidden = false
  statusText.hidden = true
}

export async function openProfilePage(username: string) {
  // La dirección apunta a este perfil mientras está abierto, para recargarlo o compartirlo
  const url = new URL(window.location.href)
  url.searchParams.set(PARAM, username)
  window.history.replaceState(null, '', url)
  const currentRequest = ++request
  current = null
  content.hidden = true
  statusText.hidden = false
  statusText.textContent = 'Cargando…'
  messageText.textContent = ''
  const result = await fetchProfile(username)
  if (currentRequest !== request) return
  if ('error' in result) {
    statusText.textContent = result.error
    document.title = 'StudyFocus'
    return
  }
  render(result)
}

// Cada cambio de amistad vuelve a pedir el perfil, para mostrar cómo quedó
async function changeFriendship(path: string, body: Record<string, string>, done: string) {
  if (!current) return
  const person = current
  friendButton.disabled = true
  messageText.textContent = ''
  try {
    const response = await fetch(`/api/friends/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) {
      messageText.textContent = result.error ?? 'No se pudo.'
      showRelation(person)
      return
    }
    messageText.textContent = done
  } catch {
    messageText.textContent = 'No se pudo conectar con el servidor.'
    showRelation(person)
    return
  }
  const updated = await fetchProfile(person.username)
  if (current === person && !('error' in updated)) render(updated)
}

export function setUpProfilePage(pageActions: typeof actions) {
  actions = pageActions
  friendButton.addEventListener('click', () => {
    if (!current) return
    if (current.relation === 'self') actions.editOwnProfile()
    else if (current.relation === 'none') changeFriendship('request', { username: current.username }, 'Le enviaste una solicitud de amistad.')
    else if (current.relation === 'received') changeFriendship('accept', { id: current.id }, `Ahora eres amigo de ${current.name}.`)
  })
  cancelButton.addEventListener('click', () => {
    if (current) changeFriendship('cancel', { id: current.id }, 'Cancelaste la solicitud.')
  })
  joinButton.addEventListener('click', () => {
    const code = current?.presence?.code
    if (code) actions.joinRoom(code)
  })
}
