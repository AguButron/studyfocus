// La página del perfil de una persona: su foto, lo que cuenta de sí, cuánto ha estudiado y si son amigos.
// Se abre con /?perfil=usuario; por ejemplo, desde su nombre en la tarjeta que aparece al hacer clic en ella
// dentro de una sala, en otra pestaña para no salir de la sala.
import { callApi } from './api'
import type { Character } from './character'
import { createCharacterPhoto } from './character'
import { getCountryName, getFlag } from './countries'
import { describePresence, type Friend } from './friends'
import { formatDuration, renderChart } from './stats'
import type { StatsVisibility } from './account'
import { LOCALE } from './i18n'

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
  stats: { total: number; week: number; streak: number; days: { date: string; seconds: number }[] } | null // nulo si no las comparte contigo
  statsVisibility: StatsVisibility
  medals: { id: string; name: string; description: string; earned: boolean }[] | null // nulo como stats
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
const studiesText = document.querySelector<HTMLSpanElement>('#person-studies')!
const bioText = document.querySelector<HTMLParagraphElement>('#person-bio')!
const aboutEmpty = document.querySelector<HTMLParagraphElement>('#person-about-empty')!
const weekText = document.querySelector<HTMLElement>('#person-week')!
const streakText = document.querySelector<HTMLElement>('#person-streak')!
const totalText = document.querySelector<HTMLElement>('#person-total')!
const chart = document.querySelector<HTMLDivElement>('#person-chart')!
const allStatsButton = document.querySelector<HTMLButtonElement>('#person-all-stats')!
const statsList = document.querySelector<HTMLDListElement>('#person-stats')!
const statsHiddenText = document.querySelector<HTMLParagraphElement>('#person-stats-hidden')!
const weekCard = document.querySelector<HTMLElement>('#person-week-card')!
const weekVisibility = document.querySelector<HTMLSpanElement>('#person-week-visibility')!
const grid = document.querySelector<HTMLDivElement>('#person-grid')!
const medalsCard = document.querySelector<HTMLElement>('#person-medals-card')!
const medalsList = document.querySelector<HTMLUListElement>('#person-medals')!

// En tu perfil, quién ve tus estadísticas (se cambia en Editar perfil)
const VISIBILITY_TEXT: Record<StatsVisibility, string> = { public: 'Público', friends: 'Solo amigos', private: 'Privado' }

const sinceFormat = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' })

let current: PersonProfile | null = null
let request = 0 // descarta la respuesta de un perfil que ya no está abierto
let actions = { joinRoom: (_code: string) => {}, editOwnProfile: () => {} }

const profilePath = (username: string) => `/perfil/${encodeURIComponent(username)}`

// El link a la página del perfil de alguien: /perfil/<usuario>
export function profileUrl(username: string) {
  return new URL(profilePath(username), window.location.origin).toString()
}

// El usuario de la página que se pidió al abrir, si viene en la dirección. Los links de antes usaban ?perfil=
export function readProfileParam() {
  const match = window.location.pathname.match(/^\/perfil\/([^/]+)\/?$/)
  if (match) {
    try {
      return decodeURIComponent(match[1])
    } catch {
      return null
    }
  }
  return new URLSearchParams(window.location.search).get(PARAM)
}

// Al ir a otra sección deja de cargarse el perfil (la dirección la cambia la sección), y se quita el ?perfil= de antes
export function clearProfileParam() {
  request++ // un perfil que aún se estaba cargando ya no se muestra
  document.title = 'StudyFocus'
  const url = new URL(window.location.href)
  if (!url.searchParams.has(PARAM)) return
  url.searchParams.delete(PARAM)
  window.history.replaceState(window.history.state, '', url)
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
    self: 'Editar perfil',
  }
  friendButton.textContent = labels[person.relation]
  friendButton.disabled = person.relation === 'sent' || person.relation === 'friend'
  friendButton.classList.toggle('sf-btn--primary', !friendButton.disabled)
  cancelButton.hidden = person.relation !== 'sent'
}

function render(person: PersonProfile) {
  current = person
  photoBox.replaceChildren(createCharacterPhoto(person.character, 'profile-hero-photo'))
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
  aboutEmpty.hidden = Boolean(person.bio)
  aboutEmpty.textContent = person.relation === 'self' ? 'Aún no cuentas nada sobre ti.' : 'Aún no ha contado nada sobre sí.'

  const { stats } = person
  statsList.hidden = !stats
  weekCard.hidden = !stats
  grid.classList.toggle('profile-grid--single', !stats)
  statsHiddenText.hidden = Boolean(stats)
  statsHiddenText.textContent = person.statsVisibility === 'friends' ? 'Solo sus amigos pueden ver sus estadísticas.' : 'Sus estadísticas son privadas.'
  if (stats) {
    weekText.textContent = formatDuration(stats.week)
    streakText.textContent = `${stats.streak} ${stats.streak === 1 ? 'día' : 'días'}`
    totalText.textContent = formatDuration(stats.total)
    renderChart(stats.days, chart)
  }
  allStatsButton.hidden = person.relation !== 'self'
  const medals = person.medals ?? []
  medalsCard.hidden = medals.length === 0
  medalsList.replaceChildren(
    ...medals.map((medal) => {
      const item = document.createElement('li')
      item.className = 'person-medal'
      item.toggleAttribute('data-earned', medal.earned)
      item.textContent = medal.name
      item.title = medal.description
      return item
    }),
  )
  weekVisibility.hidden = person.relation !== 'self'
  weekVisibility.textContent = VISIBILITY_TEXT[person.statsVisibility]

  content.hidden = false
  statusText.hidden = true
}

export async function openProfilePage(username: string) {
  // La dirección apunta a este perfil mientras está abierto, para recargarlo o compartirlo
  const url = new URL(window.location.href)
  url.pathname = profilePath(username)
  url.searchParams.delete(PARAM)
  window.history.replaceState(window.history.state, '', url)
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
  const result = await callApi(`/api/friends/${path}`, body)
  if (result.error !== null) {
    messageText.textContent = result.error
    showRelation(person)
    return
  }
  messageText.textContent = done
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
