// La pestaña de la derecha del menú: tus amigos, primero los conectados y después los desconectados
import { createCharacterPhoto } from './character'
import { describePresence, onFriendsChange, type Friend } from './friends'
import { openProfile } from './profileDialog'

const OPEN_KEY = 'studyfocus.friendsDrawer'

const drawer = document.querySelector<HTMLElement>('#friends-drawer')!
const toggleButton = document.querySelector<HTMLButtonElement>('#friends-drawer-toggle')!
const onlineCount = document.querySelector<HTMLSpanElement>('#friends-drawer-count')!
const onlineTitle = document.querySelector<HTMLHeadingElement>('#drawer-online-title')!
const offlineTitle = document.querySelector<HTMLHeadingElement>('#drawer-offline-title')!
const onlineList = document.querySelector<HTMLUListElement>('#drawer-online')!
const offlineList = document.querySelector<HTMLUListElement>('#drawer-offline')!
const emptyText = document.querySelector<HTMLParagraphElement>('#drawer-empty')!
const onlinePhotos = document.querySelector<HTMLUListElement>('#drawer-online-photos')!

function setOpen(isOpen: boolean) {
  drawer.dataset.open = String(isOpen)
  toggleButton.setAttribute('aria-expanded', String(isOpen))
  toggleButton.title = isOpen ? 'Cerrar la lista de amigos' : 'Abrir la lista de amigos'
  try {
    localStorage.setItem(OPEN_KEY, String(isOpen))
  } catch {
    // Sin almacenamiento, la pestaña vuelve a su estado inicial al recargar
  }
}

function loadOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

function showProfile(friend: Friend) {
  const presence = describePresence(friend)
  openProfile({ ...friend, presence: friend.presence ? { ...presence, code: friend.presence.code } : null })
}

// Cerrada, la pestaña muestra solo la foto de cada amigo en línea, con su estado al pasar el mouse
function createOnlinePhoto(friend: Friend) {
  const presence = describePresence(friend)
  const item = document.createElement('li')
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'drawer-online-photo'
  button.dataset.presence = presence.kind
  button.title = `${friend.name}: ${presence.text}`
  button.setAttribute('aria-label', button.title)
  button.append(createCharacterPhoto(friend.character, 'character-photo--small'))
  button.addEventListener('click', () => showProfile(friend))
  item.append(button)
  return item
}

function createFriendRow(friend: Friend) {
  const presence = describePresence(friend)
  const item = document.createElement('li')
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'drawer-friend'
  button.append(createCharacterPhoto(friend.character, 'character-photo--small'))

  const text = document.createElement('span')
  text.className = 'drawer-friend-text'
  const name = document.createElement('strong')
  name.textContent = friend.name
  const status = document.createElement('span')
  status.className = 'sf-presence'
  status.dataset.presence = presence.kind
  status.textContent = presence.text
  text.append(name, status)
  button.append(text)

  button.addEventListener('click', () => showProfile(friend))
  item.append(button)
  return item
}

function render(friends: Friend[]) {
  const online = friends.filter((friend) => friend.presence)
  const offline = friends.filter((friend) => !friend.presence)

  onlineCount.textContent = String(online.length)
  onlineCount.hidden = online.length === 0
  onlineTitle.textContent = `En línea · ${online.length}`
  offlineTitle.textContent = `Desconectados · ${offline.length}`
  onlineTitle.hidden = online.length === 0
  offlineTitle.hidden = offline.length === 0
  emptyText.hidden = friends.length > 0

  onlineList.replaceChildren(...online.map(createFriendRow))
  onlinePhotos.replaceChildren(...online.map(createOnlinePhoto))
  offlineList.replaceChildren(...offline.map(createFriendRow))
}

export function setUpFriendsDrawer() {
  setOpen(loadOpen())
  toggleButton.addEventListener('click', () => setOpen(drawer.dataset.open !== 'true'))
  onFriendsChange(render)
}
