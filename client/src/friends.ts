import { createCharacterPhoto, type Character } from './character'
import { openProfile } from './profileDialog'
// El panel de amigos: tu código, las solicitudes y en qué sala está cada amigo

interface Person {
  id: string
  name: string
  username: string | null
  character: Character
}

export interface Friend extends Person {
  // Estudiando solo no hay código: se ve que estudia, pero no se puede entrar
  presence: { code: string | null; isSolo: boolean; period: 'study' | 'break'; isRunning: boolean } | null
}

interface FriendsState {
  code: string
  friends: Friend[]
  received: Person[]
  sent: Person[]
}

const POLL_INTERVAL = 10_000 // milisegundos: lo justo para ver quién entra a estudiar
const CONFIRM_TIME = 4000 // milisegundos que espera la confirmación de quitar a alguien
const COPY_FEEDBACK_TIME = 2000 // milisegundos

const friendCodeText = document.querySelector<HTMLElement>('#friend-code')!
const copyCodeButton = document.querySelector<HTMLButtonElement>('#copy-friend-code')!
const addForm = document.querySelector<HTMLFormElement>('#add-friend-form')!
const addInput = document.querySelector<HTMLInputElement>('#add-friend-code')!
const messageText = document.querySelector<HTMLParagraphElement>('#friends-message')!
const receivedSection = document.querySelector<HTMLDivElement>('#received-section')!
const receivedList = document.querySelector<HTMLUListElement>('#received-list')!
const friendsEmpty = document.querySelector<HTMLParagraphElement>('#friends-empty')!
const friendsList = document.querySelector<HTMLUListElement>('#friends-list')!
const sentSection = document.querySelector<HTMLDivElement>('#sent-section')!
const sentList = document.querySelector<HTMLUListElement>('#sent-list')!
const badge = document.querySelector<HTMLSpanElement>('#friends-badge')!

let state: FriendsState | null = null
const friendsListeners: ((friends: Friend[]) => void)[] = []

// Inicio y la pestaña de la derecha muestran a los amigos y qué están haciendo
export function onFriendsChange(listener: (friends: Friend[]) => void) {
  friendsListeners.push(listener)
}
let pollTimer: number | null = null
let joinRoom: (code: string) => void = () => {}

function formatCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

// Un casillero por carácter, para que se pueda dictar sin confundirse
function showCode(code: string) {
  friendCodeText.replaceChildren(
    ...[...formatCode(code)].map((character) => {
      const box = document.createElement('span')
      box.textContent = character
      if (character === '-') box.dataset.sep = ''
      return box
    }),
  )
}

function showMessage(text: string, isError = false) {
  messageText.textContent = text
  messageText.classList.toggle('sf-error', isError)
}

async function request(path: string, body?: unknown): Promise<FriendsState | null> {
  try {
    const response = await fetch(`/api/friends${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) {
      showMessage(result.error ?? 'No se pudo completar.', true)
      return null
    }
    return result
  } catch {
    showMessage('No se pudo conectar con el servidor.', true)
    return null
  }
}

export function describePresence({ presence }: Friend) {
  if (!presence) return { text: 'Sin conectar', kind: 'offline' }
  if (presence.isSolo) {
    if (!presence.isRunning) return { text: 'Estudiando solo, en pausa', kind: 'room' }
    if (presence.period === 'break') return { text: 'Estudiando solo, en descanso', kind: 'break' }
    return { text: 'Estudiando solo', kind: 'study' }
  }
  if (!presence.isRunning) return { text: `En la sala ${presence.code}`, kind: 'room' }
  if (presence.period === 'break') return { text: `En descanso en la sala ${presence.code}`, kind: 'break' }
  return { text: `Estudiando en la sala ${presence.code}`, kind: 'study' }
}

function createButton(text: string, variant: 'primary' | null, onClick: (button: HTMLButtonElement) => void) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = variant ? `sf-btn sf-btn--sm sf-btn--${variant}` : 'sf-btn sf-btn--sm'
  button.textContent = text
  button.addEventListener('click', () => onClick(button))
  return button
}

// La foto y el nombre abren su perfil
function createPersonItem(
  person: Person,
  detail: string,
  detailKind: string | null,
  buttons: HTMLButtonElement[],
  presence: Friend['presence'] = null,
) {
  const item = document.createElement('li')
  item.className = 'sf-row'
  const text = document.createElement('button')
  text.type = 'button'
  text.className = 'sf-row-main friend-open'
  text.title = 'Ver su perfil'
  text.addEventListener('click', () =>
    openProfile({
      ...person,
      presence: presence && detailKind ? { text: detail, kind: detailKind, code: presence.code } : null,
    }),
  )
  item.append(text)

  const name = document.createElement('strong')
  name.className = 'sf-row-title'
  name.textContent = person.name
  // Dos personas pueden tener el mismo apodo: el nombre de usuario las distingue
  if (person.username) {
    const username = document.createElement('span')
    username.className = 'friend-username'
    username.textContent = ` @${person.username}`
    name.append(username)
  }
  text.append(name)

  if (detail) {
    const detailText = document.createElement('span')
    // Con presencia va un cuadrado de color antes del texto
    detailText.className = detailKind ? 'sf-presence' : 'sf-row-detail'
    if (detailKind) {
      detailText.dataset.presence = detailKind
    }
    detailText.textContent = detail
    text.append(detailText)
  }

  // El nombre y el estado van uno bajo el otro, a la derecha de la foto
  const column = document.createElement('span')
  column.append(...text.childNodes)
  text.append(createCharacterPhoto(person.character, 'character-photo--row'), column)
  const actions = document.createElement('div')
  actions.className = 'sf-row-actions'
  actions.append(...buttons)
  item.append(actions)
  return item
}

// Quitar a un amigo pide un segundo clic, para que no pase por accidente
function createRemoveButton(friend: Friend) {
  let confirmTimer = 0
  return createButton('Quitar', null, async (button) => {
    if (!button.classList.contains('sf-btn--danger')) {
      button.classList.add('sf-btn--danger')
      button.textContent = '¿Quitar?'
      confirmTimer = window.setTimeout(() => {
        button.classList.remove('sf-btn--danger')
        button.textContent = 'Quitar'
      }, CONFIRM_TIME)
      return
    }
    clearTimeout(confirmTimer)
    await change('/remove', { id: friend.id })
  })
}

function render() {
  if (!state) return
  for (const listener of friendsListeners) listener(state.friends)

  showCode(state.code)

  badge.hidden = state.received.length === 0
  badge.textContent = String(state.received.length)

  receivedSection.hidden = state.received.length === 0
  receivedList.replaceChildren(
    ...state.received.map((person) =>
      createPersonItem(person, 'Quiere ser tu amigo', null, [
        createButton('Aceptar', 'primary', () => change('/accept', { id: person.id }, `Ahora tú y ${person.name} son amigos.`)),
        createButton('Rechazar', null, () => change('/decline', { id: person.id })),
      ]),
    ),
  )

  friendsEmpty.hidden = state.friends.length > 0
  friendsList.replaceChildren(
    ...state.friends.map((friend) => {
      const presence = describePresence(friend)
      const buttons = [createRemoveButton(friend)]
      const code = friend.presence?.code
      if (code) {
        buttons.unshift(createButton('Entrar', null, () => joinRoom(code)))
      }
      return createPersonItem(friend, presence.text, presence.kind, buttons, friend.presence)
    }),
  )

  sentSection.hidden = state.sent.length === 0
  sentList.replaceChildren(
    ...state.sent.map((person) =>
      createPersonItem(person, 'Esperando su respuesta', null, [
        createButton('Cancelar', null, () => change('/cancel', { id: person.id })),
      ]),
    ),
  )
}

async function change(path: string, body: unknown, successMessage = '') {
  const next = await request(path, body)
  if (!next) return

  state = next
  showMessage(successMessage)
  render()
}

async function refresh() {
  const next = await request('')
  if (next) {
    state = next
    render()
  }
}

async function copyCode() {
  if (!state) return

  try {
    await navigator.clipboard.writeText(formatCode(state.code))
    copyCodeButton.textContent = '¡Copiado!'
  } catch {
    copyCodeButton.textContent = 'No se pudo copiar'
  }
  setTimeout(() => {
    copyCodeButton.textContent = 'Copiar'
  }, COPY_FEEDBACK_TIME)
}

export function setUpFriends(onJoinRoom: (code: string) => void) {
  joinRoom = onJoinRoom
  copyCodeButton.addEventListener('click', copyCode)

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const friendsBefore = state?.friends.length ?? 0
    const next = await request('/request', { code: addInput.value })
    if (!next) return

    state = next
    addInput.value = ''
    // Si la otra persona ya te había enviado una solicitud, quedan como amigos al tiro
    showMessage(next.friends.length > friendsBefore ? 'Ahora son amigos.' : 'Solicitud enviada.')
    render()
  })

  document.addEventListener('visibilitychange', () => {
    if (pollTimer !== null && !document.hidden) refresh()
  })
}

// Mientras se ve el menú, la lista se actualiza sola para mostrar quién está estudiando
export function startFriends() {
  refresh()
  if (pollTimer !== null) return

  pollTimer = window.setInterval(() => {
    if (!document.hidden) refresh()
  }, POLL_INTERVAL)
}

export function stopFriends() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
