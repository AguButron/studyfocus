import { sendAccount, type Account } from './account'
import { setUpFriends, startFriends, stopFriends } from './friends'
import { refreshCalendar } from './calendar'
import { refreshSpacesPanel, setUpSpacesPanel } from './spacesPanel'
import { refreshHomePanel, setUpHomePanel } from './homePanel'
import { setUpFriendsDrawer } from './friendsDrawer'
import { setUpProfileDialog } from './profileDialog'
import { CHARACTER_COLORS, getCharacterPhoto, type Character } from './character'
import { drawRoomPlan } from './roomPlan'
import { COUNTRIES, getFlag } from './countries'
import { ROOM_KINDS } from './roomKinds'
import { refreshStats, setUpSummary, showSavedSummary } from './stats'

type Panel = 'home' | 'calendar' | 'spaces' | 'rooms' | 'friends' | 'stats' | 'shop' | 'profile'

interface MenuActions {
  createRoom(kind: string): void
  studySolo(): void
  joinRoom(code: string): void
  onAccountChange(account: Account | null): void
}

const PANEL_KEY = 'studyfocus.panel'
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
const roomsError = document.querySelector<HTMLParagraphElement>('#rooms-error')!
const joinForm = document.querySelector<HTMLFormElement>('#join-form')!
const codeInput = document.querySelector<HTMLInputElement>('#code')!
const profileForm = document.querySelector<HTMLFormElement>('#profile-form')!
const profileNameInput = document.querySelector<HTMLInputElement>('#profile-name')!
const profileMessage = document.querySelector<HTMLParagraphElement>('#profile-message')!
const profileEmail = document.querySelector<HTMLParagraphElement>('#profile-email')!
const profileUsername = document.querySelector<HTMLElement>('#profile-username')!
const profileNameHint = document.querySelector<HTMLSpanElement>('#profile-name-hint')!
const profileSave = document.querySelector<HTMLButtonElement>('#profile-save')!
const NAME_HINT = 'Es el que verán los demás en la sala. Puedes cambiarlo una vez al mes.'
const aboutForm = document.querySelector<HTMLFormElement>('#about-form')!
const aboutStudies = document.querySelector<HTMLInputElement>('#about-studies')!
const aboutInstitution = document.querySelector<HTMLInputElement>('#about-institution')!
const aboutCountry = document.querySelector<HTMLSelectElement>('#about-country')!
const aboutBio = document.querySelector<HTMLTextAreaElement>('#about-bio')!
const aboutBioCount = document.querySelector<HTMLSpanElement>('#about-bio-count')!
const aboutMessage = document.querySelector<HTMLParagraphElement>('#about-message')!
const dateFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' })
const logoutButton = document.querySelector<HTMLButtonElement>('#logout')!

let selectedKind = ROOM_KINDS[0].id

function isPanel(value: unknown): value is Panel {
  return typeof value === 'string' && [...panels].some((panel) => panel.dataset.panel === value)
}

function showPanel(panel: Panel) {
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
  if (panel === 'stats') {
    refreshStats()
  } else if (panel === 'home') {
    refreshHomePanel(userNameText.textContent ?? '')
    refreshSpacesPanel() // su último espacio, con las horas al día
  } else if (panel === 'calendar') {
    refreshCalendar()
  } else if (panel === 'spaces') {
    refreshSpacesPanel()
  }

  try {
    sessionStorage.setItem(PANEL_KEY, panel)
  } catch {
    // Sin almacenamiento, al recargar se vuelve al panel de salas
  }
}

// Al volver de una sala se abre el panel de salas, donde aparece el resumen
function showSummaryFirst() {
  return !document.querySelector<HTMLDivElement>('#session-summary')!.hidden
}

function loadPanel(): Panel {
  try {
    const saved = sessionStorage.getItem(PANEL_KEY)
    return isPanel(saved) ? saved : 'home'
  } catch {
    return 'home'
  }
}

function showRoomKinds() {
  roomKindsList.replaceChildren()
  const plan = drawRoomPlan() // hoy hay un solo tipo de sala, con esta distribución

  for (const kind of ROOM_KINDS) {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'sf-room'
    card.setAttribute('aria-pressed', String(kind.id === selectedKind))
    card.innerHTML = `<span class="sf-room-plan sf-paper" aria-hidden="true">${plan}</span>
      <span class="sf-room-name"></span>`
    card.querySelector('.sf-room-name')!.textContent = kind.name
    card.addEventListener('click', () => {
      selectedKind = kind.id
      showRoomKinds()
    })
    roomKindsList.append(card)
  }

  const soon = document.createElement('div')
  soon.className = 'sf-room sf-room--soon'
  soon.innerHTML = '<span class="sf-badge sf-badge--soon">Próximamente</span>'
  roomKindsList.append(soon)
}

function showCharacter(character: Character) {
  const photo = getCharacterPhoto(character)
  userPhoto.src = photo
  characterPhoto.src = photo
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
  userNameText.textContent = account.name
  showCharacter(account.character)
  profileUsername.textContent = account.username ? `@${account.username}` : ''
  profileNameInput.value = account.name
  profileEmail.textContent = account.email ? `Correo: ${account.email}` : 'Cuenta de Google'

  // El apodo se cambia a lo más una vez al mes: mientras tanto, el campo queda bloqueado
  const nextChange = account.nextNameChange ? new Date(account.nextNameChange) : null
  profileNameInput.disabled = nextChange !== null
  profileSave.disabled = nextChange !== null
  profileNameHint.textContent = nextChange ? `Podrás cambiar tu apodo de nuevo el ${dateFormat.format(nextChange)}.` : NAME_HINT

  aboutStudies.value = account.profile.studies ?? ''
  aboutInstitution.value = account.profile.institution ?? ''
  aboutCountry.value = account.profile.country ?? ''
  aboutBio.value = account.profile.bio ?? ''
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
    if (link.classList.contains('menu-user')) continue // siempre dice "Perfil"
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

  createRoomButton.addEventListener('click', () => actions.createRoom(selectedKind))
  setUpHomePanel()
  setUpSpacesPanel(() => showPanel('spaces'))
  // Botones dentro de una sección que llevan a otra, como "Ver calendario"
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-open-panel]')) {
    button.addEventListener('click', () => showPanel(button.dataset.openPanel as Panel))
  }
  document.querySelector<HTMLButtonElement>('#study-solo')!.addEventListener('click', () => actions.studySolo())
  setUpFriends((code) => actions.joinRoom(code))
  setUpProfileDialog((code) => actions.joinRoom(code))
  setUpNavToggle()
  setUpFriendsDrawer()
  setUpSummary(() => showPanel('stats'))

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

  logoutButton.addEventListener('click', async () => {
    const { error } = await sendAccount('logout')
    if (error) {
      profileMessage.textContent = error
      return
    }
    actions.onAccountChange(null)
  })
}

export function showRoomsError(message: string) {
  roomsError.textContent = message
}

export function showMenu(account: Account) {
  showAccount(account)
  showRoomKinds()
  showSavedSummary()
  showPanel(showSummaryFirst() ? 'rooms' : loadPanel())
  startFriends()
  menu.hidden = false
}

// El logo lleva a Inicio
export function showHomePanel() {
  showPanel('home')
}

export function hideMenu() {
  stopFriends()
  menu.hidden = true
}
