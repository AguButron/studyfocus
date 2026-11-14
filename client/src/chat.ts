// El chat con un amigo: una ventana que sale a la izquierda de la pestaña de Amigos (en el celular, la tapa entera).
// Su foto y su nombre abren su perfil en otra pestaña, para no cortar una sesión de estudio.
// Los mensajes llegan al instante por la conexión con el servidor; al abrir una conversación se cargan los últimos
// 50, y subiendo se cargan los anteriores. Muestra "Visto" en tu último mensaje leído y "Escribiendo…".
import { createCharacterPhoto } from './character'
import { describePresence, findPerson, setUnread, type Person } from './friends'
import { socket } from './network'
import { profileUrl } from './profilePage'

const MAX_LENGTH = 1000
const TYPING_SEND_INTERVAL = 2500 // milisegundos entre avisos de "Escribiendo…"
const TYPING_SHOW_TIME = 4000 // milisegundos que se muestra "Escribiendo…" tras el último aviso
const LOAD_MORE_MARGIN = 40 // píxeles desde arriba para cargar los anteriores
const LINK = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g

interface Message {
  id: string
  from: string
  to: string
  body: string
  createdAt: string
}

const chatBox = document.querySelector<HTMLElement>('#chat')!
const closeButton = document.querySelector<HTMLButtonElement>('#chat-close')!
const profileLink = document.querySelector<HTMLAnchorElement>('#chat-profile')!
const photoBox = document.querySelector<HTMLSpanElement>('#chat-photo')!
const nameText = document.querySelector<HTMLSpanElement>('#chat-name')!
const presenceText = document.querySelector<HTMLSpanElement>('#chat-presence')!
const scrollBox = document.querySelector<HTMLDivElement>('#chat-scroll')!
const statusText = document.querySelector<HTMLParagraphElement>('#chat-status')!
const list = document.querySelector<HTMLOListElement>('#chat-messages')!
const typingText = document.querySelector<HTMLParagraphElement>('#chat-typing')!
const closedText = document.querySelector<HTMLParagraphElement>('#chat-closed')!
const form = document.querySelector<HTMLFormElement>('#chat-form')!
const input = document.querySelector<HTMLTextAreaElement>('#chat-input')!
const sendButton = document.querySelector<HTMLButtonElement>('#chat-send')!
const errorText = document.querySelector<HTMLParagraphElement>('#chat-error')!

const timeFormat = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })

let person: Person | null = null // con quién está abierta la conversación
let messages: Message[] = []
let hasMore = false
let isLoadingMore = false
let readUpTo: string | null = null // tu último mensaje que la otra persona ya leyó
let lastReadSent: string | null = null // hasta dónde se pidió marcar como leído
let lastReadSaved: string | null = null // hasta dónde el servidor confirmó que quedó guardado
let isSendingRead = false
let canWrite = false
let request = 0 // descarta lo que llega de una conversación que ya se cerró
let lastTypingSent = 0
let typingTimer = 0
let isVisible: () => boolean = () => true // si la ventana del chat se ve: ahí recién cuenta como leído
let onChange: () => void = () => {} // se abrió o se cerró una conversación

const compareIds = (a: string, b: string) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)

async function fetchPage(otherId: string, before: string | null) {
  const params = new URLSearchParams({ con: otherId })
  if (before) params.set('antes', before)
  try {
    const response = await fetch(`/api/chat?${params}`)
    const result = await response.json()
    if (!response.ok) return { error: result.error ?? 'No se pudo cargar la conversación.' }
    return result as { messages: Message[]; hasMore: boolean; canWrite: boolean; readUpTo: string | null }
  } catch {
    return { error: 'No se pudo conectar con el servidor.' }
  }
}

// El texto con sus links clicables. Se arma con nodos de texto, nunca con HTML: así un mensaje no puede inyectar nada.
// También lo usa el chat de sala
export function renderBody(body: string) {
  const fragment = document.createDocumentFragment()
  let last = 0
  for (const match of body.matchAll(LINK)) {
    fragment.append(body.slice(last, match.index))
    const link = document.createElement('a')
    link.href = match[0]
    link.textContent = match[0]
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    fragment.append(link)
    last = match.index! + match[0].length
  }
  fragment.append(body.slice(last))
  return fragment
}

export function describeDay(date: Date) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Hoy'
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer'
  const text = dayFormat.format(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function render() {
  const items: HTMLLIElement[] = []
  let lastDay = ''
  // El "Visto" va solo en tu último mensaje que ya leyó
  const isMine = (message: Message) => message.from !== person?.id
  const seenId = readUpTo
    ? [...messages].reverse().find((message) => isMine(message) && compareIds(message.id, readUpTo!) <= 0)?.id
    : undefined
  const lastMine = [...messages].reverse().find(isMine)

  for (const message of messages) {
    const date = new Date(message.createdAt)
    const day = date.toDateString()
    if (day !== lastDay) {
      lastDay = day
      const separator = document.createElement('li')
      separator.className = 'chat-day'
      separator.textContent = describeDay(date)
      items.push(separator)
    }
    const item = document.createElement('li')
    const mine = isMine(message)
    item.className = mine ? 'chat-message chat-message--mine' : 'chat-message'
    const bubble = document.createElement('p')
    bubble.className = 'chat-bubble'
    bubble.append(renderBody(message.body))
    const time = document.createElement('time')
    time.dateTime = message.createdAt
    time.textContent = timeFormat.format(date)
    item.append(bubble, time)
    if (mine && message === lastMine) {
      const state = document.createElement('span')
      state.className = 'chat-seen'
      state.textContent = message.id === seenId ? 'Visto' : 'Enviado'
      item.append(state)
    } else if (mine && message.id === seenId) {
      const state = document.createElement('span')
      state.className = 'chat-seen'
      state.textContent = 'Visto'
      item.append(state)
    }
    items.push(item)
  }
  list.replaceChildren(...items)
  statusText.hidden = messages.length > 0 && !hasMore
  if (messages.length === 0) statusText.textContent = `Aún no se han escrito. ¡Saluda a ${person?.name ?? ''}!`
  else if (hasMore) statusText.textContent = isLoadingMore ? 'Cargando…' : 'Sube para ver los anteriores'
}

function showHeader() {
  if (!person) return
  const current = findPerson(person.id)
  photoBox.replaceChildren(createCharacterPhoto(person.character, 'character-photo--small'))
  nameText.textContent = person.name
  // Sin nombre de usuario no hay página de perfil
  if (person.username) profileLink.href = profileUrl(person.username)
  else profileLink.removeAttribute('href')
  const presence = current && 'presence' in current ? describePresence(current) : null
  presenceText.hidden = !presence
  presenceText.textContent = presence?.text ?? ''
  if (presence) presenceText.dataset.presence = presence.kind
}

function showWriting() {
  closedText.hidden = canWrite
  form.hidden = !canWrite
}

const isNearBottom = () => scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight < 80
const scrollToBottom = () => (scrollBox.scrollTop = scrollBox.scrollHeight)

// Si la conversación está a la vista, lo que llegó de la otra persona queda leído. Se manda hasta el último
// mensaje de la conversación: el servidor marca solo los que te llegaron a ti hasta ahí.
// force: lo manda aunque ya se haya pedido, porque el servidor todavía cuenta mensajes sin leer
export function markRead(force = false) {
  if (!person || chatBox.hidden || document.hidden || !isVisible()) return
  const last = messages.at(-1)
  const otherId = person.id
  setUnread(otherId, () => 0)
  if (!last || isSendingRead) return
  const alreadySent = lastReadSent && compareIds(last.id, lastReadSent) <= 0
  const alreadySaved = lastReadSaved && compareIds(last.id, lastReadSaved) <= 0
  if (alreadySaved || (alreadySent && !force)) return
  sendRead(otherId, last.id)
}

async function sendRead(otherId: string, upTo: string) {
  lastReadSent = upTo
  isSendingRead = true
  const current = request
  try {
    const response = await fetch('/api/chat/leido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ con: otherId, hasta: upTo }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error)
    if (current !== request) return
    lastReadSaved = upTo
    // Lo que diga el servidor: si llegó algo nuevo mientras tanto, se vuelve a marcar
    setUnread(otherId, () => result.unread)
  } catch (error) {
    console.warn('No se pudo marcar la conversación como leída:', error)
    if (current === request) lastReadSent = null // se vuelve a intentar con el próximo mensaje o al volver a la pestaña
  } finally {
    isSendingRead = false
  }
  if (current === request && messages.at(-1)?.id !== upTo) markRead()
}

export async function openChat(next: Person) {
  person = next
  messages = []
  hasMore = false
  readUpTo = null
  lastReadSent = null
  lastReadSaved = null
  canWrite = false
  errorText.textContent = ''
  typingText.hidden = true
  input.value = ''
  chatBox.hidden = false
  onChange()
  showHeader()
  form.hidden = true
  closedText.hidden = true
  list.replaceChildren()
  statusText.hidden = false
  statusText.textContent = 'Cargando…'

  const current = ++request
  const page = await fetchPage(next.id, null)
  if (current !== request) return
  if ('error' in page) {
    statusText.textContent = page.error ?? ''
    return
  }
  messages = page.messages
  hasMore = page.hasMore
  readUpTo = page.readUpTo
  canWrite = page.canWrite
  showWriting()
  render()
  scrollToBottom()
  markRead()
  if (canWrite) input.focus()
}

export function closeChat() {
  request++
  person = null
  chatBox.hidden = true
  onChange()
}

export function getOpenChatId() {
  return chatBox.hidden ? null : (person?.id ?? null)
}

// Al subir hasta arriba se cargan los mensajes anteriores, sin mover lo que se está mirando
async function loadMore() {
  if (!person || !hasMore || isLoadingMore || messages.length === 0) return
  isLoadingMore = true
  render()
  const current = request
  const page = await fetchPage(person.id, messages[0].id)
  isLoadingMore = false
  if (current !== request) return
  if ('error' in page) {
    statusText.textContent = page.error ?? ''
    return
  }
  const before = scrollBox.scrollHeight - scrollBox.scrollTop
  messages = [...page.messages, ...messages]
  hasMore = page.hasMore
  render()
  scrollBox.scrollTop = scrollBox.scrollHeight - before
}

async function send() {
  if (!person || !canWrite) return
  const body = input.value.trim()
  if (!body) return
  if (body.length > MAX_LENGTH) {
    errorText.textContent = `Usa hasta ${MAX_LENGTH} caracteres.`
    return
  }
  errorText.textContent = ''
  sendButton.disabled = true
  const to = person.id
  try {
    // Sin conexión no se envía: Socket.IO guardaría el mensaje y lo mandaría al reconectar, minutos después,
    // como si fuera nuevo (y además de mostrar el error). volatile: si se corta justo ahora, se descarta
    if (!socket.connected) {
      errorText.textContent = 'Sin conexión con el servidor. Espera un momento y vuelve a enviarlo.'
      return
    }
    const result: { message?: Message; error?: string } = await socket.volatile.timeout(10_000).emitWithAck('chat:send', { to, body })
    if (result.error) {
      errorText.textContent = result.error
      return
    }
    if (person?.id === to) {
      input.value = ''
      resizeInput()
      addMessage(result.message!)
    }
  } catch {
    errorText.textContent = 'No se pudo enviar. Revisa tu conexión y prueba de nuevo.'
  } finally {
    sendButton.disabled = false
    input.focus()
  }
}

// Un mensaje nuevo en la conversación abierta (puede llegar dos veces: por la respuesta y por el aviso)
function addMessage(message: Message) {
  if (messages.some((other) => other.id === message.id)) return
  const isTheirs = message.from === person?.id
  const wasAtBottom = isNearBottom() || !isTheirs
  messages.push(message)
  if (isTheirs) typingText.hidden = true
  render()
  if (wasAtBottom) scrollToBottom()
}

// El cuadro de texto crece con lo escrito, hasta 5 líneas
function resizeInput() {
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`
}

function sendTyping() {
  if (!person || !canWrite || !input.value.trim()) return
  const now = Date.now()
  if (now - lastTypingSent < TYPING_SEND_INTERVAL) return
  lastTypingSent = now
  socket.volatile.emit('chat:typing', { to: person.id }) // un aviso viejo no sirve: si no hay conexión, se descarta
}

export function setUpChat(options: { isVisible: () => boolean; onChange: () => void }) {
  isVisible = options.isVisible
  onChange = options.onChange

  closeButton.addEventListener('click', closeChat)
  // Escape cierra el chat (sin cerrar también la pestaña de Amigos)
  chatBox.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    closeChat()
  })
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    send()
  })
  // Enter envía; Shift + Enter hace un salto de línea
  input.addEventListener('keydown', (event) => {
    event.stopPropagation() // que escribir no mueva al personaje ni cambie la cámara
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      send()
    }
  })
  input.addEventListener('keyup', (event) => event.stopPropagation())
  input.addEventListener('input', () => {
    resizeInput()
    errorText.textContent = ''
    sendTyping()
  })
  scrollBox.addEventListener('scroll', () => {
    if (scrollBox.scrollTop < LOAD_MORE_MARGIN) loadMore()
  })
  document.addEventListener('visibilitychange', () => markRead())

  socket.on('chat:message', (message: Message) => {
    // Un mensaje es de la otra persona si viene de alguien de tu lista; si no, lo enviaste tú (desde otra pestaña)
    const isTheirs = findPerson(message.from) !== null || (person?.id === message.from)
    const otherId = isTheirs ? message.from : message.to
    if (person?.id === otherId && !chatBox.hidden) {
      addMessage(message)
      if (isTheirs) markRead()
      if (isTheirs && (document.hidden || !isVisible())) setUnread(otherId, (count) => count + 1)
    } else if (isTheirs) {
      setUnread(otherId, (count) => count + 1)
    }
  })
  socket.on('chat:read', ({ by, upTo }: { by: string; upTo: string | null }) => {
    if (person?.id !== by || !upTo) return
    readUpTo = upTo
    render()
  })
  socket.on('chat:unread', ({ from, count }: { from: string; count?: number }) => setUnread(from, () => count ?? 0))
  socket.on('chat:typing', ({ from }: { from: string }) => {
    if (person?.id !== from || chatBox.hidden) return
    typingText.hidden = false
    clearTimeout(typingTimer)
    typingTimer = window.setTimeout(() => (typingText.hidden = true), TYPING_SHOW_TIME)
  })
  // Al reconectar pudieron llegar mensajes mientras tanto: se vuelve a cargar la conversación abierta
  socket.on('connect', () => {
    if (person && !chatBox.hidden) openChat(person)
  })
}

// La presencia de la otra persona cambia con la lista de amigos
export function refreshChatHeader() {
  if (person && !chatBox.hidden) showHeader()
}
