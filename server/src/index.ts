import { randomInt } from 'node:crypto'
import { Server, type Socket } from 'socket.io'

const PORT = 3000
const CLIENT_URL = 'http://localhost:5173'
const CODE_LENGTH = 6
const MAX_NICKNAME_LENGTH = 20
const MAX_PLAYERS_PER_ROOM = 12
const ROOM_HALF_SIZE = 6
const MIN_MOVE_INTERVAL = 30 // milisegundos
const MAX_MESSAGE_SIZE = 1024 // bytes
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // sin letras y números fáciles de confundir
const SEAT_COUNT = 16
const ACTIVITIES = ['computer', 'reading', 'writing']
const PERIODS = ['study', 'break']
const MAX_TOKEN_LENGTH = 64
const RECONNECT_WAIT = 15_000 // milisegundos que se guarda el lugar de quien se desconecta

interface PlayerStatus {
  activity: string
  period: string
  isRunning: boolean
}

interface PlayerState extends PlayerStatus {
  id: string
  nickname: string
  seatId: number | null
  x: number
  z: number
}

type Room = Map<string, PlayerState>

// El lugar de una persona, reconocida por un identificador secreto que guarda su navegador
interface Session {
  token: string
  player: PlayerState
  code: string
  socket: Socket | null // sin conexión mientras se espera que vuelva
  leaveTimer: NodeJS.Timeout | null
}

const rooms = new Map<string, Room>()
const sessions = new Map<string, Session>()

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

function isNewToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_LENGTH && !sessions.has(value)
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

function isValidStatus(value: unknown): value is PlayerStatus {
  if (typeof value !== 'object' || value === null) return false

  const { activity, period, isRunning } = value as Record<string, unknown>
  return (
    typeof activity === 'string' &&
    ACTIVITIES.includes(activity) &&
    typeof period === 'string' &&
    PERIODS.includes(period) &&
    typeof isRunning === 'boolean'
  )
}

function isFreeSeat(room: Room, seatId: unknown): seatId is number {
  if (typeof seatId !== 'number' || !Number.isInteger(seatId)) return false
  if (seatId < 0 || seatId >= SEAT_COUNT) return false

  for (const other of room.values()) {
    if (other.seatId === seatId) return false
  }
  return true
}

const io = new Server(PORT, {
  cors: { origin: CLIENT_URL },
  maxHttpBufferSize: MAX_MESSAGE_SIZE,
})

function removeFromRoom({ token, player, code }: Session) {
  sessions.delete(token)
  io.to(code).emit('player:left', player.id)

  const room = rooms.get(code)
  room?.delete(player.id)
  if (room?.size === 0) {
    rooms.delete(code)
    console.log(`Sala borrada: ${code}`)
  }
}

io.on('connection', (socket) => {
  console.log(`Conectado: ${socket.id}`)

  let player: PlayerState = {
    id: socket.id,
    nickname: '',
    seatId: null,
    x: 0,
    z: 0,
    activity: ACTIVITIES[0],
    period: PERIODS[0],
    isRunning: false,
  }
  let currentCode: string | null = null
  let session: Session | null = null
  let lastMoveAt = 0

  function enterRoom(code: string, room: Room, token: string) {
    socket.emit('players:init', [...room.values()])
    room.set(player.id, player)
    socket.join(code)
    socket.to(code).emit('player:joined', player)
    currentCode = code
    session = { token, player, code, socket, leaveTimer: null }
    sessions.set(token, session)
  }

  socket.on('room:create', (value: unknown, token: unknown, reply: unknown) => {
    if (typeof reply !== 'function' || currentCode) return

    const nickname = parseNickname(value)
    if (!nickname || !isNewToken(token)) {
      reply(null)
      return
    }

    player.nickname = nickname
    const code = createRoomCode()
    const room: Room = new Map()
    rooms.set(code, room)
    enterRoom(code, room, token)
    console.log(`Sala creada: ${code}`)
    reply(code)
  })

  socket.on('room:join', (code: unknown, value: unknown, token: unknown, reply: unknown) => {
    if (typeof reply !== 'function' || currentCode) return

    const nickname = parseNickname(value)
    const room = typeof code === 'string' ? rooms.get(code) : undefined
    if (!nickname || !isNewToken(token) || !room || room.size >= MAX_PLAYERS_PER_ROOM) {
      reply(false)
      return
    }

    player.nickname = nickname
    enterRoom(code as string, room, token)
    reply(true)
  })

  // Vuelve quien recargó o perdió la conexión: nunca salió de la sala, así que los demás no notan nada
  socket.on('room:resume', (token: unknown, reply: unknown) => {
    if (typeof reply !== 'function' || currentCode) return

    const existing = typeof token === 'string' ? sessions.get(token) : undefined
    if (!existing) {
      reply(null)
      return
    }

    if (existing.leaveTimer) {
      clearTimeout(existing.leaveTimer)
      existing.leaveTimer = null
    }

    // Al recargar, la conexión nueva puede llegar antes de que se note el cierre de la anterior
    const previousSocket = existing.socket
    existing.socket = socket
    previousSocket?.disconnect(true)

    session = existing
    player = existing.player
    currentCode = existing.code

    const others = [...rooms.get(existing.code)!.values()].filter((other) => other !== player)
    socket.emit('players:init', others)
    socket.join(existing.code)
    reply({ code: existing.code, nickname: player.nickname, seatId: player.seatId, x: player.x, z: player.z })
  })

  socket.on('seat:take', (seatId: unknown, reply: unknown) => {
  if (typeof reply !== 'function') return

  const room = currentCode ? rooms.get(currentCode) : undefined
  if (!room || player.seatId !== null || !isFreeSeat(room, seatId)) {
    reply(false)
    return
  }

  player.seatId = seatId
  socket.to(currentCode!).emit('player:seated', player)
  reply(true)
})

socket.on('seat:leave', () => {
  if (!currentCode || player.seatId === null) return

  player.seatId = null
  socket.to(currentCode).emit('player:seated', player)
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

  // Se guarda aunque aún no esté en una sala: al reconectar, puede llegar antes de volver a entrar
  socket.on('player:status', (status: unknown) => {
    if (!isValidStatus(status)) return

    player.activity = status.activity
    player.period = status.period
    player.isRunning = status.isRunning
    if (currentCode) {
      socket.to(currentCode).emit('player:status', player)
    }
  })

  socket.on('disconnect', () => {
    console.log(`Desconectado: ${socket.id}`)
    if (!session || session.socket !== socket) return

    const leavingSession = session
    leavingSession.socket = null
    leavingSession.leaveTimer = setTimeout(() => removeFromRoom(leavingSession), RECONNECT_WAIT)
  })
})

console.log(`Servidor escuchando en el puerto ${PORT}`)