// La pestaña de Amigos: tus amigos, primero los conectados y después los desconectados, y el chat con cada uno.
// En el menú de escritorio va a la derecha. En la sala y en el celular es flotante: se abre con un botón,
// encima de lo demás, y se cierra con ✕.
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

let isInRoom = false // en la sala la pestaña flota sobre la escena
let homeParent: HTMLElement | null = null // dónde vive en el menú, para devolverla al salir de la sala
const unreadListeners: ((count: number) => void)[] = []

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

// El botón de Amigos en la sala, o "Escribir" en el celular
export function showDrawer() {
  if (isFloating()) drawer.hidden = false
  else setOpen(true)
  markRead()
}

export function hideDrawer() {
  if (isFloating()) drawer.hidden = true
  else setOpen(false)
}

export function toggleDrawer() {
  if (isDrawerVisible()) hideDrawer()
  else showDrawer()
}

function showChat(person: Person) {
  showDrawer()
  openChat(person)
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
  button.addEventListener('click', () => showChat(friend))
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

  button.addEventListener('click', () => showChat(person))
  item.append(button)
  return item
}

function render(friends: Friend[], pastChats: PastChat[]) {
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
  refreshChatHeader()
}

// En la sala la pestaña sale del menú (que se esconde) y flota sobre la escena; al volver, regresa a su lugar
export function setDrawerInRoom(inRoom: boolean) {
  if (inRoom === isInRoom) return
  isInRoom = inRoom
  applyLayout()
}

export function setUpFriendsDrawer(openProfile: (username: string) => boolean) {
  applyLayout()
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
    isVisible: () => isDrawerVisible() && getOpenChatId() !== null,
    openProfile,
    onBack: () => {},
  })
  setChatOpener(showChat)
  onFriendsChange(render)
}

// Al cerrar sesión, la conversación abierta se cierra
export function resetFriendsDrawer() {
  closeChat()
  hideDrawer()
}
