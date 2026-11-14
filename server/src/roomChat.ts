import { randomUUID } from 'node:crypto'
import type { Server, Socket } from 'socket.io'
import { MAX_MESSAGE_LENGTH } from './chat.ts'
import { allowAttempt } from './requests.ts'

// El chat de sala: lo escriben todos los que están en una sala, y lo leen todos los que están en ella.
// Se escribe y se lee solo fuera de un periodo de estudio (en el descanso, en pausa o eligiendo asiento), para no romper la
// concentración de nadie. Los mensajes viven en la memoria del servidor mientras viva la sala: se borran
// cuando queda vacía, igual que la sala, o con un reinicio. Ver docs/decisiones/0030-chat-de-sala.md

const MAX_KEPT = 100 // mensajes que se guardan por sala; quien entra ve estos
const MAX_MESSAGES = 120 // por cuenta cada 15 minutos, sumando todas las salas

export interface RoomMessage {
  id: number // crece con cada mensaje, en todas las salas: sirve para ordenar y para no repetir
  from: string // la cuenta que lo escribió
  name: string
  username: string | null
  character: unknown
  body: string
  createdAt: string
}

// Lo que el chat necesita saber de la pestaña: en qué sala está y si está estudiando ahora
export interface RoomChatContext {
  code: string
  accountId: string
  isSolo: boolean
  isStudying: boolean
  name: string
  username: string | null
  character: unknown
}

const messagesByRoom = new Map<string, RoomMessage[]>()
let lastId = 0
// Cambia con cada arranque del servidor, que vuelve a contar los mensajes desde 1: así la página sabe que
// lo que ya había leído no se compara con los mensajes nuevos
const boot = randomUUID()

// La sala quedó vacía y se borró: su chat también
export function forgetRoomChat(code: string) {
  messagesByRoom.delete(code)
}

export function setUpRoomChatSocket(io: Server, socket: Socket, getContext: () => RoomChatContext | null) {
  // Lo que ya se escribió en la sala. La página lo pide al entrar y al reconectar, ya dentro de la sala.
  // me: la cuenta de esta pestaña, para saber qué mensajes son tuyos. boot: ver arriba
  socket.on('room-chat:history', (reply: unknown) => {
    if (typeof reply !== 'function') return
    const context = getContext()
    if (!context || context.isSolo) return reply(null)
    reply({ code: context.code, boot, me: context.accountId, messages: messagesByRoom.get(context.code) ?? [] })
  })

  // Enviar: responde con el mensaje guardado, o con un error para mostrar
  socket.on('room-chat:send', (raw: unknown, reply: unknown) => {
    if (typeof reply !== 'function') return
    const context = getContext()
    if (!context || context.isSolo) return reply({ error: 'Ya no estás en la sala.' })
    // La página también lo bloquea; esto es por si alguien lo intenta igual
    if (context.isStudying) return reply({ error: 'El chat se abre en el descanso.' })
    const body = (raw ?? {}) as Record<string, unknown>
    const text = typeof body.body === 'string' ? body.body.trim() : ''
    if (!text) return reply({ error: 'Escribe un mensaje.' })
    if (text.length > MAX_MESSAGE_LENGTH) return reply({ error: `Usa hasta ${MAX_MESSAGE_LENGTH} caracteres.` })
    if (!allowAttempt(`room-chat:${context.accountId}`, MAX_MESSAGES)) {
      return reply({ error: 'Estás enviando demasiados mensajes. Espera unos minutos.' })
    }

    const message: RoomMessage = {
      id: ++lastId,
      from: context.accountId,
      name: context.name,
      username: context.username,
      character: context.character,
      body: text,
      createdAt: new Date().toISOString(),
    }
    const kept = messagesByRoom.get(context.code) ?? []
    kept.push(message)
    if (kept.length > MAX_KEPT) kept.splice(0, kept.length - MAX_KEPT)
    messagesByRoom.set(context.code, kept)
    // Con el código: una página que acaba de salir de la sala descarta lo que llegue tarde
    io.to(context.code).emit('room-chat:message', { code: context.code, message })
    reply({ message })
  })

  // Estás escribiendo: los demás ven "Ana está escribiendo…" unos segundos
  socket.on('room-chat:typing', () => {
    const context = getContext()
    if (!context || context.isSolo || context.isStudying) return
    if (!allowAttempt(`room-typing:${context.accountId}`, MAX_MESSAGES * 4)) return
    socket.to(context.code).volatile.emit('room-chat:typing', { code: context.code, from: context.accountId, name: context.name })
  })
}
