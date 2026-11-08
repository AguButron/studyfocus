import { randomInt } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer, type RequestListener } from 'node:http'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'
import { Server, type Socket } from 'socket.io'
import { createAccountsHandler, findAccount, type Account } from './accounts.ts'
import { describeCharacter, type Character } from './character.ts'
import { deleteAbandonedSessions, deleteSession, loadSession, saveSession } from './activeSessions.ts'
import { createAgendaHandler } from './agenda.ts'
import { createSpacesHandler } from './spaces.ts'
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
const ROOM_KINDS = ['study', 'solo']
const SOLO_KIND = 'solo' // estudiar solo: una sala privada, que nadie más puede unirse
const MAX_TOKEN_LENGTH = 64
const RECONNECT_WAIT = 15_000 // milisegundos que se guarda el lugar de quien se desconecta
const ROOM_CLEANUP_INTERVAL = 10 * 60_000 // milisegundos
const MAX_STUDY_PERIOD = 125 * 60_000 // milisegundos: el periodo más largo que permite el temporizador, con margen
const MAX_PERIOD_ID_LENGTH = 64
const SAVE_DELAY = 1000 // milisegundos: junta varios cambios seguidos en una sola escritura
const STUDY_SAVE_INTERVAL = 60_000 // milisegundos: si el servidor se cae, se pierde a lo más esto del periodo

interface PlayerStatus {
  activity: string
  period: string
  isRunning: boolean
}

// El estado que manda la página: además dice qué periodo es, para saber si terminó o se abandonó
interface StatusMessage extends PlayerStatus {
  periodId: string
  sectionId?: string | null // el apartado que se está estudiando, si se eligió
}

interface StudySegment {
  start: number
  end: number
}

interface PlayerState extends PlayerStatus {
  id: string
  nickname: string
  username: string | null // para pedir su perfil al hacer clic en la persona
  character: Character
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
  kind: string // el tipo de sala
  socket: Socket | null // sin conexión mientras se espera que vuelva
  leaveTimer: NodeJS.Timeout | null
  joinedAt: number
  periodId: string | null // el periodo del temporizador en curso
  sectionId: string | null // el apartado que se estudia en este periodo
  studySince: number | null // desde cuándo se está estudiando sin anotarlo
  pendingSegments: StudySegment[] // lo estudiado en este periodo: se guarda solo si termina
  pendingMs: number
  studiedMs: number // lo estudiado en periodos terminados desde que entró a la sala
  lastSave: Promise<unknown>
  saveTimer: NodeJS.Timeout | null
  lastPersist: Promise<unknown> // las escrituras de la sesión van en orden, para que borrarla sea lo último
}

const rooms = new Map<string, Room>()
const roomKinds = new Map<string, string>()

function getRoomKind(code: string) {
  return roomKinds.get(code) ?? ROOM_KINDS[0]
}

function forgetRoom(code: string) {
  rooms.delete(code)
  roomKinds.delete(code)
}
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
  let savedKind: string | null = null
  try {
    savedKind = await touchSavedRoom(code)
  } catch (error) {
    console.error('No se pudo revisar la sala guardada:', error)
  }

  const room = rooms.get(code)
  if (room || !savedKind) return room

  const loadedRoom: Room = new Map()
  rooms.set(code, loadedRoom)
  roomKinds.set(code, savedKind)
  console.log(`Sala abierta de nuevo tras un reinicio: ${code}`)
  return loadedRoom
}

// Cada tanto se borran las salas vacías que quedaron en la memoria, por ejemplo si alguien se
// desconectó justo al abrirla, y las que nadie retomó después de un reinicio
setInterval(async () => {
  for (const [code, room] of rooms) {
    if (room.size === 0) forgetRoom(code)
  }
  try {
    await deleteAbandonedSessions()
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

function isValidStatus(value: unknown): value is StatusMessage {
  if (typeof value !== 'object' || value === null) return false

  const { activity, period, isRunning, periodId, sectionId } = value as Record<string, unknown>
  return (
    typeof activity === 'string' &&
    ACTIVITIES.includes(activity) &&
    typeof period === 'string' &&
    PERIODS.includes(period) &&
    typeof isRunning === 'boolean' &&
    typeof periodId === 'string' &&
    periodId.length > 0 &&
    periodId.length <= MAX_PERIOD_ID_LENGTH &&
    (sectionId === undefined || sectionId === null || (typeof sectionId === 'string' && /^\d{1,19}$/.test(sectionId)))
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
const handleAgenda = createAgendaHandler()
const handleSpaces = createSpacesHandler()
const handlePage = createPageHandler()

const httpServer = createServer((request, response) => {
  if (request.url?.startsWith('/api/friends')) {
    handleFriends(request, response)
  } else if (request.url?.startsWith('/api/stats')) {
    handleStats(request, response)
  } else if (request.url?.startsWith('/api/agenda')) {
    handleAgenda(request, response)
  } else if (request.url?.startsWith('/api/espacios') || request.url?.startsWith('/api/apartados')) {
    handleSpaces(request, response)
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

// Anota lo estudiado hasta ahora en el periodo en curso y decide si se sigue contando. Solo cuenta con
// la conexión abierta, y nunca más que un periodo completo: así una página alterada no suma horas de más.
function updateStudyClock(session: Session, isActive = session.socket !== null) {
  const now = Date.now()

  if (session.studySince !== null) {
    const end = Math.min(now, session.studySince + MAX_STUDY_PERIOD - session.pendingMs)
    if (end > session.studySince) {
      // Un tramo que sigue al anterior sin pausa se junta con él
      const last = session.pendingSegments[session.pendingSegments.length - 1]
      if (last?.end === session.studySince) {
        last.end = end
      } else {
        session.pendingSegments.push({ start: session.studySince, end })
      }
      session.pendingMs += end - session.studySince
    }
  }

  session.studySince = isActive && isStudying(session.player) ? now : null
}

// Al cambiar de periodo: si el de estudio terminó y empieza el descanso, se guarda; si se abandonó, no
function finishPeriod(session: Session, isCompleted: boolean) {
  if (isCompleted) {
    session.studiedMs += session.pendingMs
    const segments = session.pendingSegments
    session.lastSave = Promise.all(
      segments.map((segment) =>
        recordStudy(session.accountId, session.code, segment.start, segment.end, session.sectionId),
      ),
    ).catch((error) => {
      console.error('No se pudo guardar el tiempo de estudio:', error)
    })
  }
  session.pendingSegments = []
  session.pendingMs = 0
}

// Guarda la sesión en la base poco después de un cambio, para volver a ella si el servidor se reinicia
function persist(session: Session) {
  if (session.saveTimer) return

  session.saveTimer = setTimeout(() => {
    session.saveTimer = null
    if (sessions.get(session.token) !== session) return

    // Incluye el tramo que se está estudiando ahora, sin cerrarlo
    const { player } = session
    const segments = session.pendingSegments.map((segment) => ({ ...segment }))
    let pendingMs = session.pendingMs
    if (session.studySince !== null) {
      const end = Math.min(Date.now(), session.studySince + MAX_STUDY_PERIOD - pendingMs)
      if (end > session.studySince) {
        segments.push({ start: session.studySince, end })
        pendingMs += end - session.studySince
      }
    }
    const saved = {
      accountId: session.accountId,
      code: session.code,
      seatId: player.seatId,
      x: player.x,
      z: player.z,
      activity: player.activity,
      period: player.period,
      isRunning: player.isRunning,
      periodId: session.periodId,
      pendingSegments: segments,
      pendingMs,
      studiedMs: session.studiedMs,
      joinedAt: session.joinedAt,
    }
    session.lastPersist = session.lastPersist
      .then(() => saveSession(session.token, saved))
      .catch((error) => console.error('No se pudo guardar la sesión:', error))
  }, SAVE_DELAY)
}

// Lo estudiado en el periodo en curso se guarda cada tanto, aunque nada más cambie
setInterval(() => {
  for (const session of sessions.values()) {
    if (session.studySince === null) continue
    updateStudyClock(session)
    persist(session)
  }
}, STUDY_SAVE_INTERVAL)

function removeFromRoom(leavingSession: Session) {
  if (leavingSession.saveTimer) {
    clearTimeout(leavingSession.saveTimer)
    leavingSession.saveTimer = null
  }
  leavingSession.lastPersist = leavingSession.lastPersist
    .then(() => deleteSession(leavingSession.token))
    .catch((error) => console.error('No se pudo borrar la sesión:', error))

  // Salir en medio de un periodo de estudio es abandonarlo
  updateStudyClock(leavingSession, false)
  finishPeriod(leavingSession, false)
  const { token, accountId, player, code } = leavingSession
  sessions.delete(token)
  clearPresence(accountId, leavingSession)
  io.to(code).emit('player:left', player.id)

  const room = rooms.get(code)
  room?.delete(player.id)
  // Sin nadie adentro la sala se borra del todo, y su link deja de servir
  if (room?.size === 0) {
    forgetRoom(code)
    deleteSavedRoom(code).catch((error) => console.error('No se pudo borrar la sala:', error))
    console.log(`Sala borrada: ${code}`)
  }
}

function describeAccountCharacter(account: Account) {
  return describeCharacter(account.character_look, account.id)
}

io.on('connection', (socket) => {
  console.log(`Conectado: ${socket.id}`)

  let player: PlayerState = {
    id: socket.id,
    nickname: '',
    username: null,
    character: { color: '' },
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
  let lastPeriodId: string | null = null // el estado puede llegar antes de entrar a la sala
  let lastStatus: StatusMessage | null = null

  // Tras un reinicio, la sesión ya no está en la memoria, pero sí en la base: se arma de nuevo
  async function restoreSession(token: string): Promise<Session | null> {
    const account = socket.data.account
    const saved = account ? await loadSession(token) : null
    if (!saved || saved.accountId !== account.id) return null

    const room = await findRoom(saved.code)
    if (!room || room.size >= MAX_PLAYERS_PER_ROOM) return null

    const restoredPlayer: PlayerState = {
      id: socket.id,
      nickname: account.name,
      username: account.username,
      character: describeAccountCharacter(account),
      seatId: isFreeSeat(room, saved.seatId) ? saved.seatId : null,
      x: saved.x,
      z: saved.z,
      activity: saved.activity,
      period: saved.period,
      isRunning: saved.isRunning,
    }
    const restored: Session = {
      token,
      accountId: account.id,
      player: restoredPlayer,
      code: saved.code,
      kind: getRoomKind(saved.code),
      socket: null,
      leaveTimer: null,
      joinedAt: saved.joinedAt,
      periodId: saved.periodId,
      sectionId: null,
      studySince: null,
      pendingSegments: saved.pendingSegments,
      pendingMs: saved.pendingMs,
      studiedMs: saved.studiedMs,
      lastSave: Promise.resolve(),
      saveTimer: null,
      lastPersist: Promise.resolve(),
    }
    room.set(restoredPlayer.id, restoredPlayer)
    sessions.set(token, restored)
    setPresence(account.id, restored)
    socket.to(saved.code).emit('player:joined', restoredPlayer)
    console.log(`Sesión retomada tras un reinicio en la sala ${saved.code}`)
    return restored
  }

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
      kind: getRoomKind(code),
      socket,
      leaveTimer: null,
      joinedAt: Date.now(),
      periodId: lastPeriodId,
      sectionId: lastStatus?.sectionId ?? null,
      studySince: null,
      pendingSegments: [],
      pendingMs: 0,
      studiedMs: 0,
      lastSave: Promise.resolve(),
      saveTimer: null,
      lastPersist: Promise.resolve(),
    }
    sessions.set(token, session)
    setPresence(session.accountId, session)
    updateStudyClock(session)
    persist(session)
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
    player.character = describeAccountCharacter(account)
    const room: Room = new Map()
    rooms.set(code, room)
    roomKinds.set(code, kind)
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

    // A una sala de estudio solitario no entra nadie más, ni con su código
    if (!room || room.size >= MAX_PLAYERS_PER_ROOM || getRoomKind(code) === SOLO_KIND) {
      reply(false)
      return
    }

    player.nickname = account.name
    player.username = account.username
    player.character = describeAccountCharacter(account)
    enterRoom(code, room, token)
    reply(true)
  })

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

    await leavingSession.lastSave

    let companions: { name: string; seconds: number }[] = []
    try {
      companions = await findCompanions(leavingSession.accountId, leavingSession.joinedAt, leavingSession.code)
    } catch (error) {
      console.error('No se pudo armar el resumen:', error)
    }
    reply({ seconds: Math.round(leavingSession.studiedMs / 1000), companions })
  })

  // Vuelve quien recargó o perdió la conexión: nunca salió de la sala, así que los demás no notan nada
  socket.on('room:resume', async (token: unknown, reply: unknown) => {
    if (typeof reply !== 'function' || currentCode || isEntering || typeof token !== 'string') return

    let existing = sessions.get(token)
    if (!existing) {
      isEntering = true
      try {
        existing = (await restoreSession(token)) ?? undefined
      } catch (error) {
        console.error('No se pudo retomar la sesión:', error)
      }
      isEntering = false
    }
    if (!existing || !socket.connected) {
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
    // El estado que llegó antes de retomar la sesión es el más reciente
    if (lastStatus && lastStatus.periodId === existing.periodId) {
      player.activity = lastStatus.activity
      player.period = lastStatus.period
      player.isRunning = lastStatus.isRunning
    }
    updateStudyClock(existing)
    persist(existing)
    reply({
      code: existing.code,
      kind: existing.kind,
      nickname: player.nickname,
      character: player.character,
      seatId: player.seatId,
      x: player.x,
      z: player.z,
    })
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
  if (session) persist(session)
  reply(true)
})

socket.on('seat:leave', () => {
  if (!currentCode || player.seatId === null) return

  player.seatId = null
  socket.to(currentCode).emit('player:seated', player)
  if (session) persist(session)
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

    // Un periodo nuevo: lo estudiado hasta ahora es del anterior, que terminó si ahora toca descanso
    if (session && status.periodId !== session.periodId) {
      updateStudyClock(session)
      finishPeriod(session, player.period === 'study' && status.period === 'break')
      session.periodId = status.periodId
    }
    // El periodo se anota con el apartado que tenía mientras se estudiaba, así que se actualiza después
    if (session) session.sectionId = status.sectionId ?? null
    lastPeriodId = status.periodId

    player.activity = status.activity
    player.period = status.period
    player.isRunning = status.isRunning
    lastStatus = status
    if (session) {
      updateStudyClock(session)
      persist(session)
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