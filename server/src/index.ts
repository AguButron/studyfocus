import { randomInt } from 'node:crypto'
import { Server } from 'socket.io'

const PORT = 3000
const CLIENT_URL = 'http://localhost:5173'
const CODE_LENGTH = 6
const MAX_NICKNAME_LENGTH = 20
const MAX_PLAYERS_PER_ROOM = 12
const ROOM_HALF_SIZE = 6
const MIN_MOVE_INTERVAL = 30 // milisegundos
const MAX_MESSAGE_SIZE = 1024 // bytes
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // sin letras y números fáciles de confundir

interface PlayerState {
  id: string
  nickname: string
  x: number
  z: number
}

type Room = Map<string, PlayerState>

const rooms = new Map<string, Room>()

function createRoomCode() {
  let code = ''
  do {
    code = ''
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    }
  } while (rooms.has(code))
  return code
}

function parseNickname(value: unknown) {
  if (typeof value !== 'string') return null

  const nickname = value.trim()
  if (nickname.length === 0 || nickname.length > MAX_NICKNAME_LENGTH) return null
  return nickname
}

function isValidPosition(value: unknown): value is { x: number; z: number } {
  if (typeof value !== 'object' || value === null) return false

  const { x, z } = value as { x: unknown; z: unknown }
  return (
    typeof x === 'number' &&
    typeof z === 'number' &&
    Math.abs(x) <= ROOM_HALF_SIZE &&
    Math.abs(z) <= ROOM_HALF_SIZE
  )
}

const io = new Server(PORT, {
  cors: { origin: CLIENT_URL },
  maxHttpBufferSize: MAX_MESSAGE_SIZE,
})

io.on('connection', (socket) => {
  console.log(`Conectado: ${socket.id}`)

  const player: PlayerState = { id: socket.id, nickname: '', x: 0, z: 0 }
  let currentCode: string | null = null
  let lastMoveAt = 0

  function enterRoom(code: string, room: Room) {
    socket.emit('players:init', [...room.values()])
    room.set(socket.id, player)
    socket.join(code)
    socket.to(code).emit('player:joined', player)
    currentCode = code
  }

  socket.on('room:create', (value: unknown, reply: unknown) => {
    if (typeof reply !== 'function' || currentCode) return

    const nickname = parseNickname(value)
    if (!nickname) {
      reply(null)
      return
    }

    player.nickname = nickname
    const code = createRoomCode()
    const room: Room = new Map()
    rooms.set(code, room)
    enterRoom(code, room)
    console.log(`Sala creada: ${code}`)
    reply(code)
  })

  socket.on('room:join', (code: unknown, value: unknown, reply: unknown) => {
    if (typeof reply !== 'function' || currentCode) return

    const nickname = parseNickname(value)
    const room = typeof code === 'string' ? rooms.get(code) : undefined
    if (!nickname || !room || room.size >= MAX_PLAYERS_PER_ROOM) {
      reply(false)
      return
    }

    player.nickname = nickname
    enterRoom(code as string, room)
    reply(true)
  })

  socket.on('player:move', (position: unknown) => {
    if (!currentCode || !isValidPosition(position)) return

    const now = Date.now()
    if (now - lastMoveAt < MIN_MOVE_INTERVAL) return
    lastMoveAt = now

    player.x = position.x
    player.z = position.z
    socket.to(currentCode).emit('player:moved', player)
  })

  socket.on('disconnect', () => {
    console.log(`Desconectado: ${socket.id}`)
    if (!currentCode) return

    socket.to(currentCode).emit('player:left', socket.id)

    const room = rooms.get(currentCode)
    room?.delete(socket.id)
    if (room?.size === 0) {
      rooms.delete(currentCode)
      console.log(`Sala borrada: ${currentCode}`)
    }
  })
})

console.log(`Servidor escuchando en el puerto ${PORT}`)