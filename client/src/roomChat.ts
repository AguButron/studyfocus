// El chat de la sala: lo leen y lo escriben todos los que están en ella. Se abre con su botón (en la barra de
// arriba mientras eliges asiento, o en la esquina al estar sentado) y se despliega bajo él.
// Mientras estudias está bloqueado: si estaba abierto se cierra, y el botón solo cuenta los mensajes nuevos.
// Se abre de nuevo en el descanso, con el temporizador en pausa o sin empezar, o mientras eliges asiento.
// Los mensajes viven en el servidor mientras viva la sala: quien entra ve los anteriores (hasta 100).
// Ver docs/decisiones/0030-chat-de-sala.md
import { closeChat, describeDay, renderBody } from './chat'
import { createCharacterPhoto, type Character } from './character'
import { hideDrawer } from './friendsDrawer'
import { onRoomRejoined, socket } from './network'
import { profileUrl } from './profilePage'
import { isStudyRunning } from './timer'

const MAX_LENGTH = 1000
const LOCK_CHECK_INTERVAL = 500 // milisegundos: cada cuánto se revisa si empezó o terminó un periodo de estudio
const TYPING_SEND_INTERVAL = 2500 // milisegundos entre avisos de "Escribiendo…"
const TYPING_SHOW_TIME = 4000 // milisegundos que se muestra "Escribiendo…" tras el último aviso
const GROUP_TIME = 5 * 60_000 // mensajes seguidos de la misma persona en 5 minutos van juntos, con un solo nombre
const POPOVER_GAP = 8 // píxeles entre el botón y la ventana
const SEEN_KEY = 'studyfocus.roomChatSeen'

interface RoomMessage {
  id: number
  from: string
  name: string
  username: string | null
  character: Character
  body: string
  createdAt: string
}

interface History {
  code: string
  boot: string
  me: string
  messages: RoomMessage[]
}

// Hasta qué mensaje leíste, por pestaña: así, al recargar, los nuevos siguen contando como nuevos.
// boot cambia con cada reinicio del servidor, que vuelve a contar los mensajes desde 1
interface Seen {
  code: string
  boot: string
  lastId: number
}

const chatBox = document.querySelector<HTMLElement>('#room-chat')!
const closeButton = document.querySelector<HTMLButtonElement>('#room-chat-close')!
const scrollBox = document.querySelector<HTMLDivElement>('#room-chat-scroll')!
const statusText = document.querySelector<HTMLParagraphElement>('#room-chat-status')!
const list = document.querySelector<HTMLOListElement>('#room-chat-messages')!
const lockedText = document.querySelector<HTMLParagraphElement>('#room-chat-locked')!
const typingText = document.querySelector<HTMLParagraphElement>('#room-chat-typing')!
const form = document.querySelector<HTMLFormElement>('#room-chat-form')!
const input = document.querySelector<HTMLTextAreaElement>('#room-chat-input')!
const sendButton = document.querySelector<HTMLButtonElement>('#room-chat-send')!
const errorText = document.querySelector<HTMLParagraphElement>('#room-chat-error')!
const buttons = [...document.querySelectorAll<HTMLButtonElement>('.room-chat-button')]
const friendsButtons = [...document.querySelectorAll<HTMLButtonElement>('.room-friends')]

const timeFormat = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })

let code: string | null = null // la sala en la que estás; nula fuera de una sala con otros
let me: string | null = null // tu cuenta, para saber qué mensajes son tuyos
let messages: RoomMessage[] = []
let isLoaded = false // hasta cargar lo anterior, lo que llega se ignora: igual viene en lo anterior
let seen: Seen | null = null
let isLocked = false
let anchor: HTMLElement | null = null // el botón que se apretó: la ventana sale bajo él
let request = 0 // descarta lo que llega de una carga que ya no sirve
let lastTypingSent = 0
let lockTimer = 0
const typing = new Map<string, { name: string; timer: number }>()

const isOpen = () => !chatBox.hidden
const isMine = (message: RoomMessage) => message.from === me

function loadSeen(): Seen | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? 'null')
    return saved?.code === code && typeof saved.boot === 'string' && Number.isInteger(saved.lastId) ? saved : null
  } catch {
    return null
  }
}

function saveSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    // Sin almacenamiento, al recargar lo anterior cuenta como leído
  }
}

function countUnread() {
  if (!seen) return 0
  return messages.filter((message) => !isMine(message) && message.id > seen!.lastId).length
}

// El número de mensajes nuevos en los dos botones (el de la barra y el de la esquina)
function renderButtons() {
  const unread = countUnread()
  for (const button of buttons) {
    const badge = button.querySelector<HTMLSpanElement>('.room-chat-unread')!
    badge.hidden = unread === 0
    badge.textContent = String(unread)
    button.setAttribute('aria-expanded', String(isOpen()))
    const news = unread > 0 ? ` · ${unread} ${unread === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}` : ''
    button.title = isLocked ? `Chat de la sala: se abre en el descanso${news}` : `Chat de la sala${news}`
    button.setAttribute('aria-label', button.title)
  }
}

// Con la ventana abierta y a la vista (y sin estar estudiando), lo que llegó queda leído
function markSeen() {
  if (!code || !seen || !isOpen() || isLocked || document.hidden) return
  const lastId = messages.at(-1)?.id ?? seen.lastId
  if (lastId > seen.lastId) {
    seen.lastId = lastId
    saveSeen()
  }
  renderButtons()
}

function createMessage(message: RoomMessage, showAuthor: boolean) {
  const item = document.createElement('li')
  const mine = isMine(message)
  item.className = mine ? 'chat-message chat-message--mine' : 'chat-message room-chat-message'
  if (!mine && showAuthor) {
    // Su foto y su nombre: el nombre abre su perfil en otra pestaña, para no cortar la sesión de estudio
    const author = document.createElement(message.username ? 'a' : 'span')
    author.className = 'room-chat-author'
    if (author instanceof HTMLAnchorElement) {
      author.href = profileUrl(message.username!)
      author.target = '_blank'
      author.rel = 'noopener'
      author.title = `Ver el perfil de ${message.name} en otra pestaña`
    }
    const name = document.createElement('span')
    name.textContent = message.name
    author.append(createCharacterPhoto(message.character, 'room-chat-face'), name)
    item.append(author)
  }
  const bubble = document.createElement('p')
  bubble.className = 'chat-bubble'
  bubble.append(renderBody(message.body))
  const time = document.createElement('time')
  time.dateTime = message.createdAt
  time.textContent = timeFormat.format(new Date(message.createdAt))
  item.append(bubble, time)
  return item
}

function render() {
  const items: HTMLLIElement[] = []
  let lastDay = ''
  let previous: RoomMessage | null = null
  for (const message of messages) {
    const date = new Date(message.createdAt)
    const day = date.toDateString()
    if (day !== lastDay) {
      lastDay = day
      previous = null
      const separator = document.createElement('li')
      separator.className = 'chat-day'
      separator.textContent = describeDay(date)
      items.push(separator)
    }
    const followsPrevious =
      previous !== null && previous.from === message.from && date.getTime() - new Date(previous.createdAt).getTime() < GROUP_TIME
    items.push(createMessage(message, !followsPrevious))
    previous = message
  }
  list.replaceChildren(...items)
  statusText.hidden = isLoaded && messages.length > 0
  if (!isLoaded) statusText.textContent = 'Cargando…'
  else if (messages.length === 0) statusText.textContent = 'Aún nadie escribe. Lo que escribas lo ven todos en la sala.'
}

// Bloqueado mientras estudias: no se ven los mensajes ni se puede escribir, solo cuántos llegaron
function renderLock() {
  scrollBox.hidden = isLocked
  form.hidden = isLocked
  lockedText.hidden = !isLocked
  if (isLocked) {
    const unread = countUnread()
    lockedText.textContent =
      unread > 0
        ? `Estás estudiando: el chat se abre en el descanso. ${unread === 1 ? 'Te espera 1 mensaje nuevo' : `Te esperan ${unread} mensajes nuevos`}.`
        : 'Estás estudiando: el chat se abre en el descanso.'
    errorText.textContent = ''
  }
  renderTyping()
}

const isNearBottom = () => scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight < 80
const scrollToBottom = () => (scrollBox.scrollTop = scrollBox.scrollHeight)

function renderTyping() {
  const names = [...typing.values()].map((person) => person.name)
  typingText.hidden = isLocked || names.length === 0
  typingText.textContent =
    names.length === 1
      ? `${names[0]} está escribiendo…`
      : names.length === 2
        ? `${names[0]} y ${names[1]} están escribiendo…`
        : 'Varias personas están escribiendo…'
}

function clearTyping() {
  for (const person of typing.values()) clearTimeout(person.timer)
  typing.clear()
  renderTyping()
}

// Pide lo que ya se escribió en la sala: al entrar y al volver tras perder la conexión
async function loadHistory() {
  if (!code) return
  const current = ++request
  let history: History | null = null
  try {
    history = await socket.timeout(10_000).emitWithAck('room-chat:history')
  } catch {
    history = null
  }
  if (current !== request || !code) return
  if (!history || history.code !== code) {
    // Sin respuesta: se intenta de nuevo al reconectar
    statusText.hidden = false
    statusText.textContent = 'No se pudo cargar el chat. Se intentará de nuevo al reconectar.'
    return
  }
  const wasAtBottom = isNearBottom()
  me = history.me
  messages = history.messages
  isLoaded = true
  // Primera vez en esta sala: lo anterior cuenta como leído. Tras un reinicio del servidor, todo lo que hay es nuevo
  seen ??= loadSeen()
  if (!seen) seen = { code, boot: history.boot, lastId: messages.at(-1)?.id ?? 0 }
  else if (seen.boot !== history.boot) seen = { code, boot: history.boot, lastId: 0 }
  saveSeen()
  render()
  renderLock()
  if (wasAtBottom || !isOpen()) scrollToBottom()
  markSeen()
  renderButtons()
}

function addMessage(message: RoomMessage) {
  if (messages.some((other) => other.id === message.id)) return
  const wasAtBottom = isNearBottom() || isMine(message)
  messages.push(message)
  const typer = typing.get(message.from)
  if (typer) {
    clearTimeout(typer.timer)
    typing.delete(message.from)
    renderTyping()
  }
  // Lo tuyo no cuenta como nuevo, aunque lo hayas escrito antes de empezar a estudiar
  if (isMine(message) && seen && message.id > seen.lastId) {
    seen.lastId = message.id
    saveSeen()
  }
  render()
  if (wasAtBottom) scrollToBottom()
  markSeen()
  renderButtons()
  if (isLocked && isOpen()) renderLock()
}

function placeWindow() {
  if (!isOpen()) return
  const visible = buttons.find((button) => button === anchor && button.offsetParent !== null)
    ?? buttons.find((button) => button.offsetParent !== null)
  if (!visible) return
  const rect = visible.getBoundingClientRect()
  chatBox.style.setProperty('--room-chat-top', `${Math.round(rect.bottom + POPOVER_GAP)}px`)
  chatBox.style.setProperty('--room-chat-right', `${Math.round(window.innerWidth - rect.right)}px`)
}

function openRoomChat() {
  if (!code) return
  // Una ventana a la vez: se cierran la lista de amigos y su chat
  hideDrawer()
  closeChat()
  chatBox.hidden = false
  placeWindow()
  render()
  renderLock()
  scrollToBottom()
  markSeen()
  renderButtons()
  if (!isLocked) input.focus()
}

export function closeRoomChat() {
  if (!isOpen()) return
  chatBox.hidden = true
  // Que las teclas vuelvan a mover al personaje
  if (chatBox.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
  renderButtons()
}

// Revisa si empezó o terminó un periodo de estudio
function checkLock() {
  const locked = isStudyRunning()
  if (locked === isLocked) return
  isLocked = locked
  if (locked) {
    closeRoomChat() // al empezar a estudiar el chat se cierra
    clearTyping()
  }
  renderLock()
  // Se desbloqueó con la ventana abierta: los mensajes estaban escondidos y no se podían bajar hasta el último
  if (!locked && isOpen()) {
    scrollToBottom()
    input.focus()
  }
  markSeen()
  renderButtons()
}

async function send() {
  if (!code || isLocked) return
  const body = input.value.trim()
  if (!body) return
  if (body.length > MAX_LENGTH) {
    errorText.textContent = `Usa hasta ${MAX_LENGTH} caracteres.`
    return
  }
  errorText.textContent = ''
  // Sin conexión no se envía: Socket.IO lo guardaría y lo mandaría al reconectar, minutos después, como si
  // fuera nuevo. volatile: si se corta justo ahora, se descarta. El texto queda escrito para reenviarlo
  if (!socket.connected) {
    errorText.textContent = 'Sin conexión con el servidor. Espera un momento y vuelve a enviarlo.'
    return
  }
  const sentIn = code
  sendButton.disabled = true
  try {
    const result: { message?: RoomMessage; error?: string } = await socket.volatile
      .timeout(10_000)
      .emitWithAck('room-chat:send', { body })
    if (code !== sentIn) return
    if (result.error) {
      errorText.textContent = result.error
      return
    }
    input.value = ''
    resizeInput()
    addMessage(result.message!)
  } catch {
    errorText.textContent = 'No se pudo enviar. Revisa tu conexión y prueba de nuevo.'
  } finally {
    sendButton.disabled = false
    if (isOpen() && !isLocked) input.focus()
  }
}

// El cuadro de texto crece con lo escrito, hasta 5 líneas
function resizeInput() {
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`
}

function sendTyping() {
  if (!code || isLocked || !input.value.trim()) return
  const now = Date.now()
  if (now - lastTypingSent < TYPING_SEND_INTERVAL) return
  lastTypingSent = now
  socket.volatile.emit('room-chat:typing') // un aviso viejo no sirve: si no hay conexión, se descarta
}

// Al entrar a una sala con otros (no al estudiar solo)
export function startRoomChat(roomCode: string) {
  code = roomCode
  me = null
  messages = []
  isLoaded = false
  seen = null
  isLocked = isStudyRunning()
  for (const button of buttons) button.hidden = false
  render()
  renderLock()
  renderButtons()
  clearInterval(lockTimer)
  lockTimer = window.setInterval(checkLock, LOCK_CHECK_INTERVAL)
  loadHistory()
}

// Al salir de la sala
export function stopRoomChat() {
  request++
  code = null
  closeRoomChat()
  clearInterval(lockTimer)
  clearTyping()
  messages = []
  isLoaded = false
  input.value = ''
  errorText.textContent = ''
  for (const button of buttons) button.hidden = true
  try {
    sessionStorage.removeItem(SEEN_KEY)
  } catch {
    // Sin almacenamiento no había nada guardado
  }
}

export function setUpRoomChat() {
  for (const button of buttons) {
    button.hidden = true
    button.addEventListener('click', () => {
      anchor = button
      if (isOpen()) closeRoomChat()
      else openRoomChat()
    })
  }
  // Al abrir la lista de amigos se cierra el chat de la sala (también con el teclado, sin un clic)
  for (const button of friendsButtons) button.addEventListener('click', closeRoomChat)
  closeButton.addEventListener('click', closeRoomChat)
  // Un clic fuera de la ventana y de sus botones la cierra, como un menú desplegable
  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return
    const target = event.target as Node
    if (chatBox.contains(target) || buttons.some((button) => button.contains(target))) return
    closeRoomChat()
  })
  chatBox.addEventListener('keydown', (event) => {
    event.stopPropagation() // que escribir no mueva al personaje ni cambie la cámara
    if (event.key === 'Escape') closeRoomChat()
  })
  chatBox.addEventListener('keyup', (event) => event.stopPropagation())
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    send()
  })
  // Enter envía; Shift + Enter hace un salto de línea
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      send()
    }
  })
  input.addEventListener('input', () => {
    resizeInput()
    errorText.textContent = ''
    sendTyping()
  })
  window.addEventListener('resize', placeWindow)
  document.addEventListener('visibilitychange', markSeen)

  socket.on('room-chat:message', ({ code: messageCode, message }: { code: string; message: RoomMessage }) => {
    if (messageCode !== code || !isLoaded) return
    addMessage(message)
  })
  socket.on('room-chat:typing', ({ code: typingCode, from, name }: { code: string; from: string; name: string }) => {
    if (typingCode !== code || from === me) return
    const previous = typing.get(from)
    if (previous) clearTimeout(previous.timer)
    const timer = window.setTimeout(() => {
      typing.delete(from)
      renderTyping()
    }, TYPING_SHOW_TIME)
    typing.set(from, { name, timer })
    renderTyping()
  })
  // Al volver tras perder la conexión pudieron llegar mensajes mientras tanto (o el servidor se reinició)
  onRoomRejoined(() => {
    clearTyping()
    loadHistory()
  })
}
