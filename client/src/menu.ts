import { sendAccount, type Account } from './account'
import { setUpFriends, startFriends, stopFriends } from './friends'
import { refreshCalendar } from './calendar'
import { refreshSpacesPanel, setUpSpacesPanel } from './spacesPanel'
import { refreshHomePanel, setUpHomePanel } from './homePanel'
import { resetFriendsDrawer, setUpFriendsDrawer } from './friendsDrawer'
import { clearProfileParam, openProfilePage, readProfileParam, setUpProfilePage } from './profilePage'
import { setUpProfileDialog } from './profileDialog'
import { CHARACTER_COLORS, setCharacterPhoto, type Character } from './character'
import { drawRoomPlan } from './roomPlan'
import { COUNTRIES, getFlag } from './countries'
import { DEFAULT_ROOM_KIND, ROOM_KINDS, SOLO_ROOM_KIND } from './roomKinds'
import { chooseDesign, getChosenDesign } from './choices'
import { designsFor } from './voxel/designs'
import { refreshStats, setUpStatsPeople, setUpStatsRange, setUpSummary, showSavedSummary } from './stats'
import { loadHistory } from './goals'
import { showNotice } from './undoToast'
import { LOCALE } from './i18n'
import { refreshAdmin, setStaff } from './admin'
import { callApi } from './api'

type Panel = 'home' | 'schedule' | 'calendar' | 'spaces' | 'rooms' | 'friends' | 'stats' | 'shop' | 'profile' | 'settings' | 'person' | 'goals' | 'admin'

interface MenuActions {
  createRoom(kind: string, design: string | null): void
  studySolo(): void // el estudio individual, que no se comparte
  joinRoom(code: string): void
  onAccountChange(account: Account | null): void
}

// La dirección de cada sección: se puede recargar, compartir o guardar. El perfil de otra persona es
// /perfil/<usuario> (profilePage.ts). El servidor entrega la misma página en todas (createPageHandler)
const PANEL_PATHS: Record<Panel, string> = {
  home: '/',
  schedule: '/horario',
  calendar: '/calendario',
  spaces: '/carpetas',
  rooms: '/estudiar',
  friends: '/amigos',
  stats: '/estadisticas',
  shop: '/tienda',
  profile: '/perfil',
  settings: '/ajustes',
  person: '/perfil',
  goals: '/objetivos',
  admin: '/admin',
}
const NAV_KEY = 'studyfocus.navCollapsed'

const menu = document.querySelector<HTMLDivElement>('#menu')!
// Las secciones del menú, más tu foto abajo, que abre el perfil
const menuLinks = document.querySelectorAll<HTMLButtonElement>('.menu-nav button[data-panel]')
const panels = document.querySelectorAll<HTMLElement>('.menu-panel')
const userNameText = document.querySelector<HTMLSpanElement>('#menu-user-name')!
const userPhoto = document.querySelector<HTMLImageElement>('#menu-user-photo')!
const characterPhoto = document.querySelector<HTMLImageElement>('#character-photo')!
const characterColors = document.querySelector<HTMLDivElement>('#character-colors')!
const characterMessage = document.querySelector<HTMLParagraphElement>('#character-message')!
const roomKindsList = document.querySelector<HTMLDivElement>('#room-kinds')!
const createRoomButton = document.querySelector<HTMLButtonElement>('#create-room')!
const roomDesignsField = document.querySelector<HTMLDivElement>('#room-designs-field')!
const roomDesignsList = document.querySelector<HTMLDivElement>('#room-designs')!
const previewView = document.querySelector<HTMLDivElement>('#room-preview-view')!
const previewPlan = document.querySelector<HTMLDivElement>('#room-preview-plan')!
const previewName = document.querySelector<HTMLElement>('#room-preview-name')!
const previewText = document.querySelector<HTMLSpanElement>('#room-preview-text')!
const roomsPanel = document.querySelector<HTMLElement>('section[data-panel="rooms"]')! // no el botón del menú, que también lo lleva
const roomsError = document.querySelector<HTMLParagraphElement>('#rooms-error')!
const joinForm = document.querySelector<HTMLFormElement>('#join-form')!
const codeInput = document.querySelector<HTMLInputElement>('#code')!
const profileForm = document.querySelector<HTMLFormElement>('#profile-form')!
const profileNameInput = document.querySelector<HTMLInputElement>('#profile-name')!
const profileMessage = document.querySelector<HTMLParagraphElement>('#profile-message')!
const profileEmail = document.querySelector<HTMLElement>('#profile-email')!
const profilePublic = document.querySelector<HTMLButtonElement>('#profile-public')!
const settingsUsername = document.querySelector<HTMLElement>('#settings-username')!
const ownProfileButton = document.querySelector<HTMLButtonElement>('#menu-own-profile')!
let ownUsername: string | null = null // las cuentas de antes aún no lo eligen
const profileNameHint = document.querySelector<HTMLSpanElement>('#profile-name-hint')!
const profileSave = document.querySelector<HTMLButtonElement>('#profile-save')!
const NAME_HINT = 'Es el que verán los demás en la sala. Puedes cambiarlo una vez al mes.'
const aboutForm = document.querySelector<HTMLFormElement>('#about-form')!
const aboutStudies = document.querySelector<HTMLInputElement>('#about-studies')!
const aboutInstitution = document.querySelector<HTMLInputElement>('#about-institution')!
const aboutCountry = document.querySelector<HTMLSelectElement>('#about-country')!
const aboutBio = document.querySelector<HTMLTextAreaElement>('#about-bio')!
const aboutStatsVisibility = document.querySelector<HTMLSelectElement>('#about-stats-visibility')!
const aboutBioCount = document.querySelector<HTMLSpanElement>('#about-bio-count')!
const aboutMessage = document.querySelector<HTMLParagraphElement>('#about-message')!
const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' })
const logoutButton = document.querySelector<HTMLButtonElement>('#logout')!
const userButton = document.querySelector<HTMLButtonElement>('#menu-user')!
const userOptions = document.querySelector<HTMLDivElement>('#menu-user-options')!

let selectedKind = DEFAULT_ROOM_KIND

// El diseño en cubos de la sala que se va a crear: el último elegido para ese tipo, o el primero
function selectedDesign() {
  const designs = designsFor(selectedKind)
  const chosen = getChosenDesign(selectedKind)
  return designs.find((design) => design.id === chosen) ?? designs[0] ?? null
}

// Los diseños del tipo elegido, para elegir cómo se ve la sala: lo ven todos los que entran (en el estudio
// individual, solo tú). Las salas sin diseños todavía no muestran esta parte
function showRoomDesigns() {
  const designs = designsFor(selectedKind)
  roomDesignsField.hidden = designs.length === 0
  const current = selectedDesign()
  roomDesignsList.replaceChildren(...designs.map((design) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = design.name
    button.setAttribute('aria-pressed', String(design.id === current?.id))
    button.addEventListener('click', () => {
      chooseDesign(selectedKind, design.id) // sin almacenamiento, la próxima vez parte con el primero
      showRoomDesigns()
    })
    return button
  }))
  showRoomPreview()
}

// La vista previa en cubos (con Three.js) se descarga la primera vez que se necesita
let preview: typeof import('./voxel/roomPreview') | null = null

// La vista previa a la derecha: la sala en cubos con el diseño elegido, o su plano si todavía no tiene
// diseños (el Café, la Biblioteca y el Salón de estudio)
async function showRoomPreview() {
  const kind = ROOM_KINDS.find((option) => option.id === selectedKind)
  const design = selectedDesign()
  previewName.textContent = design ? `${kind?.name ?? ''} · ${design.name}` : (kind?.name ?? '')
  previewText.textContent = design?.description ?? kind?.description ?? ''
  previewView.dataset.mode = design ? '3d' : 'plan'
  if (!design) {
    previewPlan.innerHTML = drawRoomPlan(undefined, selectedKind)
    preview?.pauseRoomPreview()
    return
  }
  if (!roomsPanel.checkVisibility()) return // se arma al abrir Estudiar: oculto, el lienzo quedaría de 0×0
  preview ??= await import('./voxel/roomPreview')
  preview.showRoomPreview(previewView, design.id)
}

function isPanel(value: unknown): value is Panel {
  return typeof value === 'string' && [...panels].some((panel) => panel.dataset.panel === value)
}

// push: deja una entrada en el historial del navegador; replace: cambia la actual; none: viene de atrás/adelante
function showPanel(panel: Panel, mode: 'push' | 'replace' | 'none' = 'push') {
  for (const link of menuLinks) {
    if (link.dataset.panel === panel) {
      link.setAttribute('aria-current', 'page')
      link.scrollIntoView({ block: 'nearest', inline: 'nearest' }) // en pantallas angostas el menú se desliza
    } else {
      link.removeAttribute('aria-current')
    }
  }
  for (const section of panels) {
    section.hidden = section.dataset.panel !== panel
  }
  // Tu foto se marca cuando estás en algo de su menú
  if (panel === 'profile' || panel === 'settings') userButton.setAttribute('aria-current', 'page')
  else userButton.removeAttribute('aria-current')
  if (userOptions.matches(':popover-open')) userOptions.hidePopover()
  if (panel === 'stats') {
    refreshStats()
  } else if (panel === 'home') {
    refreshHomePanel(userNameText.textContent ?? '')
    refreshSpacesPanel() // su último espacio, con las horas al día
  } else if (panel === 'calendar') {
    refreshCalendar()
  } else if (panel === 'spaces' || panel === 'schedule') {
    refreshSpacesPanel() // el horario se arma con las carpetas al día
  } else if (panel === 'goals') {
    loadHistory()
  } else if (panel === 'admin') {
    refreshAdmin()

  }
  // La vista previa de la sala dibuja solo mientras se ve Estudiar
  if (panel === 'rooms') showRoomPreview()
  else preview?.pauseRoomPreview()
  // Volver a abrir la misma sección no suma otra entrada; un perfil distinto sí
  if (mode === 'push' && panel !== 'person' && window.history.state?.panel === panel) mode = 'replace'
  // La dirección de la sección, sin cambiar lo demás (por ejemplo ?sala=). El perfil de otra persona la pone
  // openProfilePage, con su usuario; viniendo de atrás/adelante, el navegador ya la puso
  const url = new URL(window.location.href)
  if (panel !== 'person' && mode !== 'none') url.pathname = PANEL_PATHS[panel]
  if (mode === 'push') window.history.pushState({ panel }, '', url)
  if (mode === 'replace') window.history.replaceState({ panel }, '', url)
  if (panel !== 'person') clearProfileParam()
}

// La sección que pide la dirección al abrir la página; una dirección que no existe lleva a Inicio
function panelFromPath(): Panel {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const found = (Object.keys(PANEL_PATHS) as Panel[]).find((panel) => panel !== 'person' && PANEL_PATHS[panel] === path)
  return found ?? 'home'
}

// Al volver de una sala se abre el panel de salas, donde aparece el resumen
function showSummaryFirst() {
  return !document.querySelector<HTMLDivElement>('#session-summary')!.hidden
}

function showRoomKinds() {
  roomKindsList.replaceChildren()

  // Una tarjeta por tipo, con su plano, cuántas personas caben y cómo es
  for (const kind of ROOM_KINDS) {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'sf-room'
    card.setAttribute('aria-pressed', String(kind.id === selectedKind))
    card.innerHTML = `<span class="sf-room-plan sf-paper" aria-hidden="true">${drawRoomPlan(undefined, kind.id)}</span>
      <span class="sf-room-name"></span>
      <span class="sf-room-text"></span>
      <span class="sf-room-meta"></span>`
    card.querySelector('.sf-room-name')!.textContent = kind.name
    card.querySelector('.sf-room-text')!.textContent = kind.description
    card.querySelector('.sf-room-meta')!.textContent = kind.seats === 1 ? 'Solo tú' : `Hasta ${kind.seats} personas`
    card.addEventListener('click', () => {
      selectedKind = kind.id
      showRoomKinds()
    })
    roomKindsList.append(card)
  }
  // Al estudio individual se entra directo; las demás se crean para compartir su link
  createRoomButton.textContent = selectedKind === SOLO_ROOM_KIND ? 'Empezar a estudiar' : 'Crear sala'
  showRoomDesigns()
}

function showCharacter(character: Character) {
  setCharacterPhoto(userPhoto, character)
  setCharacterPhoto(characterPhoto, character)
  for (const swatch of characterColors.querySelectorAll<HTMLButtonElement>('button')) {
    swatch.setAttribute('aria-pressed', String(swatch.dataset.color === character.color))
  }
}

function fillCharacterColors() {
  for (const { color, name } of CHARACTER_COLORS) {
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.className = 'character-swatch'
    swatch.dataset.color = color
    swatch.style.setProperty('--swatch', color)
    swatch.setAttribute('aria-label', name)
    swatch.title = name
    swatch.addEventListener('click', () => chooseColor(color))
    characterColors.append(swatch)
  }
}

async function chooseColor(color: string) {
  characterMessage.textContent = ''
  characterMessage.classList.remove('sf-error')
  const { account, error } = await sendAccount('character', { color })
  if (!account) {
    characterMessage.textContent = error
    characterMessage.classList.add('sf-error')
    return
  }
  showAccount(account)
  actions.onAccountChange(account)
}

function showAccount(account: Account) {
  setStaff(account.staff ?? [])
  userNameText.textContent = account.name
  showCharacter(account.character)
  ownUsername = account.username
  settingsUsername.textContent = account.username ? `@${account.username}` : '–'
  profileNameInput.value = account.name
  profileEmail.textContent = account.email ? `Con correo: ${account.email}` : 'Con Google'

  // El apodo se cambia a lo más una vez al mes: mientras tanto, el campo queda bloqueado
  const nextChange = account.nextNameChange ? new Date(account.nextNameChange) : null
  profileNameInput.disabled = nextChange !== null
  profileSave.disabled = nextChange !== null
  profileNameHint.textContent = nextChange ? `Podrás cambiar tu apodo de nuevo el ${dateFormat.format(nextChange)}.` : NAME_HINT

  aboutStudies.value = account.profile.studies ?? ''
  aboutInstitution.value = account.profile.institution ?? ''
  aboutCountry.value = account.profile.country ?? ''
  aboutBio.value = account.profile.bio ?? ''
  aboutStatsVisibility.value = account.profile.statsVisibility
  showBioCount()
}

function showBioCount() {
  aboutBioCount.textContent = `${aboutBio.value.length} de ${aboutBio.maxLength} caracteres`
}

function fillCountries() {
  const none = new Option('Prefiero no decirlo', '')
  aboutCountry.replaceChildren(none, ...COUNTRIES.map(({ code, name }) => new Option(`${getFlag(code)} ${name}`, code)))
}

let actions: MenuActions

// El panel de la izquierda se achica a solo íconos; al pasar el mouse, cada uno dice su nombre
function setNavCollapsed(isCollapsed: boolean) {
  const toggle = document.querySelector<HTMLButtonElement>('#menu-nav-toggle')!
  const label = isCollapsed ? 'Agrandar el menú' : 'Achicar el menú'
  menu.dataset.navCollapsed = String(isCollapsed)
  toggle.setAttribute('aria-expanded', String(!isCollapsed))
  toggle.setAttribute('aria-label', label)
  toggle.title = label
  for (const link of menuLinks) {
    if (userOptions.contains(link)) continue // el menú de tu foto siempre muestra los nombres
    link.title = isCollapsed ? (link.querySelector('.sf-nav-label')?.textContent ?? '') : ''
  }
  try {
    localStorage.setItem(NAV_KEY, String(isCollapsed))
  } catch {
    // Sin almacenamiento, el panel vuelve a su tamaño al recargar
  }
}

function setUpNavToggle() {
  let isCollapsed = false
  try {
    isCollapsed = localStorage.getItem(NAV_KEY) === 'true'
  } catch {
    // Sin almacenamiento, parte abierto
  }
  setNavCollapsed(isCollapsed)
  document
    .querySelector('#menu-nav-toggle')!
    .addEventListener('click', () => setNavCollapsed(menu.dataset.navCollapsed !== 'true'))
}

export function setUpMenu(menuActions: MenuActions) {
  actions = menuActions

  for (const link of menuLinks) {
    link.addEventListener('click', () => showPanel(link.dataset.panel as Panel))
  }
  // Los botones atrás y adelante del navegador recorren las secciones ya visitadas
  window.addEventListener('popstate', (event) => {
    const panel = event.state?.panel
    if (menu.hidden || !isPanel(panel)) return
    showPanel(panel, 'none')
    const username = readProfileParam()
    if (panel === 'person' && username) openProfilePage(username)
  })

  // El estudio individual no es una sala para compartir: se entra directo a tu escritorio
  createRoomButton.addEventListener('click', () =>
    selectedKind === SOLO_ROOM_KIND ? actions.studySolo() : actions.createRoom(selectedKind, selectedDesign()?.id ?? null),
  )
  setUpHomePanel()
  setUpProfilePage({ joinRoom: (code) => actions.joinRoom(code), editOwnProfile: () => showPanel('profile') })
  setUpSpacesPanel(() => showPanel('spaces'))
  // Botones dentro de una sección que llevan a otra, como "Ver calendario"
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-open-panel]')) {
    button.addEventListener('click', () => showPanel(button.dataset.openPanel as Panel))
  }
  setUpFriends((code) => actions.joinRoom(code))
  setUpProfileDialog((code) => actions.joinRoom(code))
  setUpNavToggle()
  setUpFriendsDrawer()
  setUpSummary(() => showPanel('stats'))
  setUpStatsRange()
  setUpStatsPeople((username) => showPersonPanel(username))
  // "Perfil" en el menú de tu foto y "← Ver mi perfil" abren tu perfil público; desde ahí, "Editar perfil" lleva a editarlo
  const showOwnProfile = () => (ownUsername ? showPersonPanel(ownUsername) : showPanel('profile'))
  ownProfileButton.addEventListener('click', showOwnProfile)
  profilePublic.addEventListener('click', showOwnProfile)

  joinForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const code = codeInput.value.trim().toUpperCase()
    if (code) {
      actions.joinRoom(code)
    } else {
      showRoomsError('Escribe el código de la sala.')
    }
  })

  fillCountries()
  fillCharacterColors()
  aboutBio.addEventListener('input', showBioCount)

  aboutForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    aboutMessage.textContent = ''
    aboutMessage.classList.remove('sf-error')
    const { account, error } = await sendAccount('profile', {
      studies: aboutStudies.value,
      institution: aboutInstitution.value,
      country: aboutCountry.value,
      bio: aboutBio.value,
      statsVisibility: aboutStatsVisibility.value,
    })
    if (!account) {
      aboutMessage.textContent = error
      aboutMessage.classList.add('sf-error')
      return
    }
    showAccount(account)
    aboutMessage.textContent = 'Perfil guardado.'
    actions.onAccountChange(account)
  })

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    profileMessage.textContent = ''
    const { account, error } = await sendAccount('name', { name: profileNameInput.value })
    if (!account) {
      profileMessage.textContent = error
      return
    }
    showAccount(account)
    profileMessage.textContent = 'Apodo guardado.'
    actions.onAccountChange(account)
  })

  // El menú de tu foto se abre hacia arriba, sobre ella; se cierra con un clic afuera o Esc
  userButton.addEventListener('click', () => {
    if (userOptions.matches(':popover-open')) {
      userOptions.hidePopover()
      return
    }
    userOptions.showPopover()
    const rect = userButton.getBoundingClientRect()
    userOptions.style.left = `${rect.left}px`
    userOptions.style.bottom = `${innerHeight - rect.top + 6}px`
  })
  userOptions.addEventListener('toggle', (event) => {
    userButton.setAttribute('aria-expanded', String((event as ToggleEvent).newState === 'open'))
  })

  logoutButton.addEventListener('click', async () => {
    const { error } = await sendAccount('logout')
    if (error) {
      showNotice(error)
      return
    }
    stopFriends()
    resetFriendsDrawer()
    actions.onAccountChange(null)
  })
}

export function showRoomsError(message: string) {
  roomsError.textContent = message
}

// Una advertencia del equipo: se muestra una vez, y al cerrarla (Entendido o Esc) queda vista
function showWarning(warning: { id: string; reason: string | null }) {
  const dialog = document.querySelector<HTMLDialogElement>('#warning-dialog')!
  const ok = document.querySelector<HTMLButtonElement>('#warning-ok')!
  document.querySelector('#warning-text')!.textContent = warning.reason ?? ''
  const markSeen = () => {
    dialog.close()
    ok.removeEventListener('click', markSeen)
    dialog.removeEventListener('cancel', markSeen)
    callApi('/api/account/warning-seen', { id: warning.id })
  }
  ok.addEventListener('click', markSeen)
  dialog.addEventListener('cancel', markSeen)
  dialog.showModal()
}

export function showMenu(account: Account) {
  showAccount(account)
  showRoomKinds()
  showSavedSummary()
  if (account.warning) {
    showWarning(account.warning)
    account.warning = null // al volver al menú en esta visita no se muestra otra vez
  }
  menu.hidden = false // antes de elegir la sección: la vista previa de Estudiar solo se arma si se ve
  showPanel(showSummaryFirst() ? 'rooms' : panelFromPath(), 'replace')
  startFriends()
}

// La página del perfil de alguien, por su nombre de usuario
export function showPersonPanel(username: string) {
  showPanel('person')
  openProfilePage(username)
  if (username === ownUsername) userButton.setAttribute('aria-current', 'page') // tu propio perfil
}

// El logo lleva a Inicio
export function showHomePanel() {
  showPanel('home')
}

export function hideMenu() {
  clearProfileParam() // al entrar a una sala, la dirección deja de apuntar a un perfil
  menu.hidden = true
}
