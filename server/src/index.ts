import { randomInt } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer, type RequestListener } from 'node:http'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'
import { Server, type Socket } from 'socket.io'
import { createAccountsHandler, findAccount } from './accounts.ts'
import { createFriendsHandler } from './friends.ts'
import { clearPresence, setPresence } from './presence.ts'
import { createStatsHandler, findCompanions, recordStudy } from './stats.ts'
import { deleteAbandonedRooms, deleteSavedRoom, saveRoom, touchSavedRoom } from './savedRooms.ts'

const PORT = Number(process.env.PORT) || 3000 // el hosting indica el puerto con esta variable
const CLIENT_DIR = fileURLToPath(new URL('../../client/dist', import.meta.url))
const CODE_LENGTH = 6
const MAX_PLAYERS_PER_ROOM = 12
const ROOM_HALF_SIZE = 6
const MIN_MOVE_INTERVAL = 30 // milisegundos
const MAX_MESSAGE_SIZE = 1024 // bytes
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // sin letras y números fáciles de confundir
const SEAT_COUNT = 16
const ACTIVITIES = ['computer', 'reading', 'writing']
const PERIODS = ['study', 'break']
const ROOM_KINDS = ['study'] // por ahora hay un solo tipo de sala
const MAX_TOKEN_LENGTH = 64
const RECONNECT_WAIT = 15_000 // milisegundos que se guarda el lugar de quien se desconecta
const STUDY_SAVE_INTERVAL = 5 * 60_000 // milisegundos: si el servidor se cae, se pierde a lo más esto
const ROOM_CLEANUP_INTERVAL = 10 * 60_000 // milisegundos
const MAX_STUDY_RUN = 125 * 60_000 // milisegundos: el periodo más largo que permite el temporizador, con margen

interface PlayerStatus {
  activity: string
  period: string
  isRunning: boolean
}

interface PlayerState extends PlayerStatus {
  id: string
  nickname: string
  username: string | null // para pedir su perfil al hacer clic en la persona
  seatId: number | null
  x: number
  z: number
}

type Room = Map<string, PlayerState>

// El lugar de una persona, reconocida por un identificador secreto que guarda su navegador
interface Session {
  token: string
  accountId: string
  player: PlayerState
  code: string
  socket: Socket | null // sin conexión mientras se espera que vuelva
  leaveTimer: NodeJS.Timeout | null
  joinedAt: number
  studyRunStart: number | null // cuándo empezó el periodo de estudio en curso
  studySince: number | null // desde cuándo falta guardar lo estudiado
  studiedMs: number // lo estudiado desde que entró a la sala
  lastSave: Promise<unknown>
}

const rooms = new Map<string, Room>()
const sessions = new Map<string, Session>()

function createRoomCode() {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return code
}

// Si falla la base de datos, la sala se crea igual, solo que sin guardarse
async function createFreeRoomCode(accountId: string, kind: string) {
  while (true) {
    const code = createRoomCode()
    if (rooms.has(code)) continue

    try {
      if (await saveRoom(code, accountId, kind)) return code
    } catch (error) {
      console.error('No se pudo guardar la sala:', error)
      return code
    }
  }
}

// Una sala con gente puede no estar en la memoria si el servidor se reinició: se abre de nuevo
async function findRoom(code: string) {
  let isSaved = false
  try {
    isSaved = await touchSavedRoom(code)
  } catch (error) {
    console.error('No se pudo revisar la sala guardada:', error)
  }

  const room = rooms.get(code)
  if (room || !isSaved) return room

  const loadedRoom: Room = new Map()
  rooms.set(code, loadedRoom)
  console.log(`Sala abierta de nuevo tras un reinicio: ${code}`)
  return loadedRoom
}

// Cada tanto se borran las salas vacías que quedaron en la memoria, por ejemplo si alguien se
// desconectó justo al abrirla, y las que nadie retomó después de un reinicio
setInterval(async () => {
  for (const [code, room] of rooms) {
    if (room.size === 0) rooms.delete(code)
  }
  try {
    const deleted = await deleteAbandonedRooms([...rooms.keys()])
    if (deleted > 0) console.log(`Salas abandonadas borradas: ${deleted}`)
  } catch (error) {
    console.error('No se pudieron borrar las salas abandonadas:', error)
  }
}, ROOM_CLEANUP_INTERVAL)

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

function createPageHandler(): RequestListener {
  // Mientras se desarrolla puede no estar compilado: la página la entrega Vite
  if (!existsSync(CLIENT_DIR)) {
    return (_request, response) => {
      response.statusCode = 404
      response.end()
    }
  }

  const servePage = sirv(CLIENT_DIR, { etag: true })
  return (request, response) => {
    servePage(request, response, () => {
      response.statusCode = 404
      response.end()
    })
  }
}

const handleAccounts = createAccountsHandler()
const handleFriends = createFriendsHandler()
const handleStats = createStatsHandler()
const handlePage = createPageHandler()

const httpServer = createServer((request, response) => {
  if (request.url?.startsWith('/api/friends')) {
    handleFriends(request, response)
  } else if (request.url?.startsWith('/api/stats')) {
    handleStats(request, response)
  } else if (request.url?.startsWith('/api/')) {
    handleAccounts(request, response)
  } else {
    handlePage(request, response)
  }
})

// La página viene de este mismo servidor, o de Vite, que le pasa la conexión mientras se desarrolla
const io = new Server(httpServer, {
  maxHttpBufferSize: MAX_MESSAGE_SIZE,
})

// La cuenta se lee al conectarse: al iniciar o cerrar sesión, o al cambiar el nombre, el cliente se reconecta
io.use(async (socket, next) => {
  try {
    socket.data.account = await findAccount(socket.handshake.headers.cookie)
  } catch (error) {
    console.error('No se pudo leer la cuenta al conectarse:', error)
    socket.data.account = null
  }
  next()
})

function isStudying(player: PlayerState) {
  return player.isRunning && player.period === 'study'
}

// Guarda lo estudiado hasta ahora y decide si se sigue contando. Solo cuenta con la conexión abierta,
// y nunca más que un periodo de estudio seguido: así una página alterada no puede sumar horas de más.
function updateStudyClock(session: Session, isActive = session.socket !== null) {
  const now = Date.now()

  if (session.studySince !== null && session.studyRunStart !== null) {
    const end = Math.min(now, session.studyRunStart + MAX_STUDY_RUN)
    if (end > session.studySince) {
      session.studiedMs += end - session.studySince
      session.lastSave = recordStudy(session.accountId, session.code, session.studySince, end).catch((error) => {
        console.error('No se pudo guardar el tiempo de estudio:', error)
      })
    }
  }

  if (isActive && isStudying(session.player)) {
    session.studyRunStart ??= now
    session.studySince = now
  } else {
    session.studyRunStart = null
    session.studySince = null
  }
}

setInterval(() => {
  for (const session of sessions.values()) {
    if (session.studySince !== null) updateStudyClock(session)
  }
}, STUDY_SAVE_INTERVAL)

function removeFromRoom(leavingSession: Session) {
  updateStudyClock(leavingSession, false)
  const { token, accountId, player, code } = leavingSession
  sessions.delete(token)
  clearPresence(accountId, leavingSession)
  io.to(code).emit('player:left', player.id)

  const room = rooms.get(code)
  room?.delete(player.id)
  // Sin nadie adentro la sala se borra del todo, y su link deja de servir
  if (room?.size === 0) {
    rooms.delete(code)
    deleteSavedRoom(code).catch((error) => console.error('No se pudo borrar la sala:', error))
    console.log(`Sala borrada: ${code}`)
  }
}

io.on('connection', (socket) => {
  console.log(`Conectado: ${socket.id}`)

  let player: PlayerState = {
    id: socket.id,
    nickname: '',
    username: null,
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
  let isEntering = false // crear o unirse esperan a la base de datos: evita entrar dos veces

  function enterRoom(code: string, room: Room, token: string) {
    socket.emit('players:init', [...room.values()])
    room.set(player.id, player)
    socket.join(code)
    socket.to(code).emit('player:joined', player)
    currentCode = code
    session = {
      token,
      accountId: socket.data.account.id,
      player,
      code,
      socket,
      leaveTimer: null,
      joinedAt: Date.now(),
      studyRunStart: null,
      studySince: null,
      studiedMs: 0,
      lastSave: Promise.resolve(),
    }
    sessions.set(token, session)
    setPresence(session.accountId, session)
    updateStudyClock(session)
  }

  // Para crear o unirse hace falta una cuenta, y el apodo es su nombre
  socket.on('room:create', async (kind: unknown, token: unknown, reply: unknown) => {
    if (typeof reply !== 'function' || currentCode || isEntering) return

    const account = socket.data.account
    if (!account || typeof kind !== 'string' || !ROOM_KINDS.includes(kind) || !isNewToken(token)) {
      reply(null)
      return
    }

    isEntering = true
    const code = await createFreeRoomCode(account.id, kind)
    isEntering = false
    if (!socket.connected || !isNewToken(token)) return

    player.nickname = account.name
    player.username = account.username
    const room: Room = new Map()
    rooms.set(code, room)
    enterRoom(code, room, token)
    console.log(`Sala creada: ${code}`)
    reply(code)
  })

  socket.on('room:join', async (code: unknown, token: unknown, reply: unknown) => {
    if (typeof reply !== 'function' || currentCode || isEntering) return

    const account = socket.data.account
    if (!account || !isNewToken(token) || typeof code !== 'string' || code.length !== CODE_LENGTH) {
      reply(false)
      return
    }

    isEntering = true
    const room = await findRoom(code)
    isEntering = false
    if (!socket.connected || !isNewToken(token)) return

    if (!room || room.size >= MAX_PLAYERS_PER_ROOM) {
      reply(false)
      return
    }

    player.nickname = account.name
    player.username = account.username
    enterRoom(code, room, token)
    reply(true)
  })

  // Al volver al menú: sale de inmediato, sin esperar a que vuelva como al recargar
  // Al volver al menú: sale de inmediato, y responde cuánto estudió y con quién para el resumen
  socket.on('room:leave', async (reply: unknown) => {
    if (!session) {
      if (typeof reply === 'function') reply(null)
      return
    }

    const leavingSession = session
    removeFromRoom(leavingSession)
    socket.leave(leavingSession.code)
    session = null
    currentCode = null
    player = { ...player, id: socket.id, seatId: null, x: 0, z: 0 }
    if (typeof reply !== 'function') return

    // Los demás de la sala guardan lo suyo, para que el resumen los encuentre
    const others = [...sessions.values()].filter((other) => other.code === leavingSession.code)
    for (const other of others) updateStudyClock(other)
    await Promise.all([leavingSession, ...others].map((each) => each.lastSave))

    let companions: { name: string; seconds: number }[] = []
    try {
      companions = await findCompanions(leavingSession.accountId, leavingSession.joinedAt, leavingSession.code)
    } catch (error) {
      console.error('No se pudo armar el resumen:', error)
    }
    reply({ seconds: Math.round(leavingSession.studiedMs / 1000), companions })
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
    updateStudyClock(existing)
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
    if (session) {
      updateStudyClock(session)
    }
    if (currentCode) {
      socket.to(currentCode).emit('player:status', player)
    }
  })

  socket.on('disconnect', () => {
    console.log(`Desconectado: ${socket.id}`)
    if (!session || session.socket !== socket) return

    const leavingSession = session
    leavingSession.socket = null
    updateStudyClock(leavingSession) // sin conexión deja de contar, y vuelve a contar si regresa
    leavingSession.leaveTimer = setTimeout(() => removeFromRoom(leavingSession), RECONNECT_WAIT)
  })
})

httpServer.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`)
})