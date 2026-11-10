// La pestaña de Amigos: tus amigos, primero los conectados y después los desconectados. Al apretar uno, su chat
// sale en una ventana a la izquierda de la pestaña. En el menú de escritorio va a la derecha. En la sala y en el
// celular es flotante: se abre con un botón, encima de lo demás, y se cierra con ✕.
import { closeChat, getOpenChatId, markRead, openChat, refreshChatHeader, setUpChat } from './chat'
import { createCharacterPhoto } from './character'
import { describePresence, getUnreadTotal, onFriendsChange, setChatOpener, type Friend, type PastChat, type Person } from './friends'

const OPEN_KEY = 'studyfocus.friendsDrawer'
const narrowScreen = window.matchMedia('(max-width: 720px)') // en el celular el menú no tiene la columna de la derecha

const drawer = document.querySelector<HTMLElement>('#friends-drawer')!
const toggleButton = document.querySelector<HTMLButtonElement>('#friends-drawer-toggle')!
const closeButton = document.querySelector<HTMLButtonElement>('#friends-drawer-close')!
const onlineCount = document.querySelector<HTMLSpanElement>('#friends-drawer-count')!
const unreadCount = document.querySelector<HTMLSpanElement>('#friends-drawer-unread')!
const onlineTitle = document.querySelector<HTMLHeadingElement>('#drawer-online-title')!
const offlineTitle = document.querySelector<HTMLHeadingElement>('#drawer-offline-title')!
const pastTitle = document.querySelector<HTMLHeadingElement>('#drawer-past-title')!
const onlineList = document.querySelector<HTMLUListElement>('#drawer-online')!
const offlineList = document.querySelector<HTMLUListElement>('#drawer-offline')!
const pastList = document.querySelector<HTMLUListElement>('#drawer-past')!
const emptyText = document.querySelector<HTMLParagraphElement>('#drawer-empty')!
const onlinePhotos = document.querySelector<HTMLUListElement>('#drawer-online-photos')!
const chatWindow = document.querySelector<HTMLElement>('#chat')!
const CHAT_GAP = 12 // píxeles entre la pestaña y la ventana del chat

let isInRoom = false // en la sala la pestaña flota sobre la escena
// En la sala, la lista es una ventana que se despliega bajo el botón de Amigos que se apretó
let roomAnchor: HTMLElement | null = null
const roomButtons = [...document.querySelectorAll<HTMLButtonElement>('.room-friends')]
const MAX_FACES = 3 // fotos de amigos en línea en el botón de la sala
const POPOVER_GAP = 8 // píxeles entre el botón y la ventana
let homeParent: HTMLElement | null = null // dónde vive en el menú, para devolverla al salir de la sala
const unreadListeners: ((count: number) => void)[] = []
let lastFriends: Friend[] = []
let lastPastChats: PastChat[] = []

const isFloating = () => isInRoom || narrowScreen.matches

function setOpen(isOpen: boolean) {
  drawer.dataset.open = String(isOpen)
  toggleButton.setAttribute('aria-expanded', String(isOpen))
  toggleButton.title = isOpen ? 'Cerrar la lista de amigos' : 'Abrir la lista de amigos'
  try {
    localStorage.setItem(OPEN_KEY, String(isOpen))
  } catch {
    // Sin almacenamiento, la pestaña vuelve a su estado inicial al recargar
  }
  if (isOpen) markRead()
}

function loadOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

// Flotante: escondida hasta que se abre con su botón, y al nivel de la página (fuera del menú, que forma
// su propia capa y la dejaría bajo la música). En la columna del menú: siempre está
function applyLayout() {
  const floating = isFloating()
  homeParent ??= drawer.parentElement
  if (floating && drawer.parentElement !== document.body) document.body.append(drawer)
  if (!floating && homeParent && drawer.parentElement !== homeParent) homeParent.append(drawer)
  drawer.toggleAttribute('data-floating', floating)
  drawer.toggleAttribute('data-popover', isInRoom)
  closeButton.hidden = !floating
  if (floating) {
    drawer.hidden = true
    drawer.dataset.open = 'true'
  } else {
    drawer.hidden = false
    setOpen(loadOpen())
  }
}

export function isDrawerVisible() {
  return !drawer.hidden && drawer.dataset.open === 'true'
}

// En la sala: la ventana queda bajo el botón, alineada a su borde derecho, y del alto justo para la lista
function placePopover() {
  if (!isInRoom || drawer.hidden) return
  const anchor = roomButtons.find((button) => button === roomAnchor && button.offsetParent !== null)
    ?? roomButtons.find((button) => button.offsetParent !== null)
  if (!anchor) return
  const rect = anchor.getBoundingClientRect()
  drawer.style.setProperty('--popover-top', `${Math.round(rect.bottom + POPOVER_GAP)}px`)
  drawer.style.setProperty('--popover-right', `${Math.round(window.innerWidth - rect.right)}px`)
}

function showRoomButtonsExpanded(expanded: boolean) {
  for (const button of roomButtons) button.setAttribute('aria-expanded', String(expanded))
}

// El botón de Amigos en la sala, o "Escribir" en el celular
export function showDrawer() {
  if (isFloating()) drawer.hidden = false
  else setOpen(true)
  placePopover()
  showRoomButtonsExpanded(isInRoom)
  markRead()
}

export function hideDrawer() {
  if (isFloating()) drawer.hidden = true
  else setOpen(false)
  showRoomButtonsExpanded(false)
  if (isInRoom) closeChat() // en la sala el chat sale de la lista: se cierran juntos
}

// El botón de la sala: las fotos de hasta 3 amigos en línea, "+2" si hay más, y los mensajes sin leer
function renderRoomButtons(friends: Friend[], unread: number) {
  const online = friends.filter((friend) => friend.presence)
  for (const button of roomButtons) {
    const faces = button.querySelector<HTMLSpanElement>('.room-friends-faces')!
    const label = button.querySelector<HTMLSpanElement>('.room-friends-label')!
    const badge = button.querySelector<HTMLSpanElement>('.room-friends-unread')!
    faces.replaceChildren(...online.slice(0, MAX_FACES).map((friend) => createCharacterPhoto(friend.character, 'room-friends-face')))
    faces.hidden = online.length === 0
    // Sin nadie conectado dice "Amigos"; con más de 3, cuántos más hay
    label.textContent = online.length === 0 ? 'Amigos' : online.length > MAX_FACES ? `+${online.length - MAX_FACES}` : ''
    label.hidden = label.textContent === ''
    badge.hidden = unread === 0
    badge.textContent = String(unread)
    const parts = [
      online.length === 0 ? 'Ningún amigo en línea' : `${online.length} ${online.length === 1 ? 'amigo en línea' : 'amigos en línea'}`,
      unread > 0 ? `${unread} ${unread === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}` : '',
    ].filter(Boolean)
    button.title = `Amigos: ${parts.join(' · ')}`
    button.setAttribute('aria-label', button.title)
  }
}

export function toggleDrawer() {
  if (isDrawerVisible()) hideDrawer()
  else showDrawer()
}

// La altura (centro) del amigo que se apretó: la ventana del chat sale desde ahí. Nula: abajo, como siempre
let anchorY: number | null = null
const EDGE = 16 // píxeles de margen con el borde de la pantalla
const ARROW_OFFSET = 36 // píxeles desde arriba de la ventana hasta la flecha que apunta al amigo

function showChat(person: Person, anchor?: HTMLElement) {
  showDrawer()
  if (anchor) {
    const rect = anchor.getBoundingClientRect()
    anchorY = rect.top + rect.height / 2
  } else {
    anchorY = null
  }
  openChat(person)
  // Que se note que sale del amigo: se vuelve a animar cada vez que se abre
  chatWindow.removeAttribute('data-pop')
  void chatWindow.offsetWidth
  chatWindow.setAttribute('data-pop', '')
}

// Para el número de mensajes sin leer en el botón de Amigos de la sala
export function onUnreadChange(listener: (count: number) => void) {
  unreadListeners.push(listener)
}

function createUnreadBadge(count: number) {
  const badge = document.createElement('span')
  badge.className = 'sf-badge sf-badge--count drawer-unread'
  badge.textContent = String(count)
  badge.title = `${count} ${count === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}`
  return badge
}

// Cerrada, la pestaña muestra solo la foto de cada amigo en línea, con su estado al pasar el mouse
function createOnlinePhoto(friend: Friend) {
  const presence = describePresence(friend)
  const item = document.createElement('li')
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'drawer-online-photo'
  button.dataset.presence = presence.kind
  button.title = `${friend.name}: ${presence.text}${friend.unread ? ` · ${friend.unread} sin leer` : ''}`
  button.setAttribute('aria-label', button.title)
  button.append(createCharacterPhoto(friend.character, 'character-photo--small'))
  if (friend.unread > 0) button.append(createUnreadBadge(friend.unread))
  button.addEventListener('click', () => showChat(friend, button))
  item.append(button)
  return item
}

function createRow(person: Friend | PastChat, detail: { text: string; kind: string } | null) {
  const item = document.createElement('li')
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'drawer-friend'
  button.title = `Escribirle a ${person.name}`
  button.toggleAttribute('data-unread', person.unread > 0)
  button.toggleAttribute('data-active', getOpenChatId() === person.id)
  button.append(createCharacterPhoto(person.character, 'character-photo--small'))

  const text = document.createElement('span')
  text.className = 'drawer-friend-text'
  const name = document.createElement('strong')
  name.textContent = person.name
  text.append(name)
  if (detail) {
    const status = document.createElement('span')
    status.className = 'sf-presence'
    status.dataset.presence = detail.kind
    status.textContent = detail.text
    text.append(status)
  }
  button.append(text)
  if (person.unread > 0) button.append(createUnreadBadge(person.unread))

  button.addEventListener('click', () => showChat(person, button))
  item.append(button)
  return item
}

function render(friends: Friend[], pastChats: PastChat[]) {
  lastFriends = friends
  lastPastChats = pastChats
  const online = friends.filter((friend) => friend.presence)
  const offline = friends.filter((friend) => !friend.presence)

  onlineCount.textContent = String(online.length)
  onlineCount.hidden = online.length === 0
  onlineTitle.textContent = `En línea · ${online.length}`
  offlineTitle.textContent = `Desconectados · ${offline.length}`
  onlineTitle.hidden = online.length === 0
  offlineTitle.hidden = offline.length === 0
  pastTitle.hidden = pastChats.length === 0
  emptyText.hidden = friends.length > 0 || pastChats.length > 0

  onlineList.replaceChildren(...online.map((friend) => createRow(friend, describePresence(friend))))
  onlinePhotos.replaceChildren(...online.map(createOnlinePhoto))
  offlineList.replaceChildren(...offline.map((friend) => createRow(friend, describePresence(friend))))
  pastList.replaceChildren(...pastChats.map((person) => createRow(person, { text: 'Ya no son amigos', kind: 'offline' })))

  const unread = getUnreadTotal()
  unreadCount.hidden = unread === 0
  unreadCount.textContent = String(unread)
  unreadCount.title = `${unread} ${unread === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}`
  for (const listener of unreadListeners) listener(unread)
  renderRoomButtons(friends, unread)
  refreshChatHeader()
}

// En la sala la pestaña sale del menú (que se esconde) y flota sobre la escena; al volver, regresa a su lugar
export function setDrawerInRoom(inRoom: boolean) {
  if (inRoom === isInRoom) return
  isInRoom = inRoom
  applyLayout()
}

// La ventana del chat queda a la izquierda de la pestaña (o de la ventana de la sala), donde sea que esté,
// y a la altura del amigo, sin salirse de la pantalla; la flecha sigue apuntándolo
function placeChat() {
  const left = drawer.hidden ? window.innerWidth : drawer.getBoundingClientRect().left
  chatWindow.style.setProperty('--chat-right', `${Math.round(window.innerWidth - left) + CHAT_GAP}px`)
  chatWindow.toggleAttribute('data-anchored', anchorY !== null)
  if (anchorY === null) return
  const height = chatWindow.getBoundingClientRect().height || Math.min(560, window.innerHeight - 80)
  const top = Math.max(EDGE, Math.min(anchorY - ARROW_OFFSET, window.innerHeight - height - EDGE))
  chatWindow.style.setProperty('--chat-top', `${Math.round(top)}px`)
  chatWindow.style.setProperty('--chat-arrow', `${Math.round(Math.max(16, Math.min(anchorY - top, height - 16)))}px`)
}

export function setUpFriendsDrawer() {
  applyLayout()
  new ResizeObserver(placeChat).observe(drawer)
  window.addEventListener('resize', () => {
    placePopover()
    placeChat()
  })
  placeChat()

  // Los botones de Amigos de la sala (arriba al caminar, en la esquina al estar sentado)
  for (const button of roomButtons) {
    button.addEventListener('click', () => {
      roomAnchor = button
      toggleDrawer()
    })
  }
  // En la sala, un clic fuera de la ventana y del chat los cierra, como un menú desplegable
  document.addEventListener('pointerdown', (event) => {
    if (!isInRoom || drawer.hidden) return
    const target = event.target as Node
    if (drawer.contains(target) || chatWindow.contains(target) || roomButtons.some((button) => button.contains(target))) return
    hideDrawer()
    closeChat()
  })
  // Al pasar de celular a escritorio (o al revés), solo si cambió el modo
  const relayout = () => {
    if (drawer.hasAttribute('data-floating') !== isFloating()) applyLayout()
  }
  narrowScreen.addEventListener('change', relayout)
  window.addEventListener('resize', relayout)
  toggleButton.addEventListener('click', () => {
    if (isFloating()) return // flotante, el encabezado no la achica: se cierra con ✕
    setOpen(drawer.dataset.open !== 'true')
  })
  closeButton.addEventListener('click', hideDrawer)
  drawer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isFloating()) {
      event.stopPropagation()
      hideDrawer()
    }
  })
  setUpChat({
    isVisible: () => getOpenChatId() !== null,
    // Se marca en la lista con quién está abierto el chat
    onChange: () => {
      placeChat()
      render(lastFriends, lastPastChats)
    },
  })
  setChatOpener(showChat)
  onFriendsChange(render)
}

// Al cerrar sesión, la conversación abierta se cierra
export function resetFriendsDrawer() {
  closeChat()
  hideDrawer()
}
