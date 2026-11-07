import { io } from 'socket.io-client'
import type { ActivityKind } from './activity'
import type { Period } from './timer'

const SEND_INTERVAL = 66 // milisegundos, unas 15 veces por segundo
const SESSION_KEY = 'studyfocus.session'
const CONNECT_TIMEOUT = 3000 // milisegundos

interface Session {
  token: string
  code: string
  nickname: string
}

export interface ResumedPlayer {
  code: string
  nickname: string
  seatId: number | null
  x: number
  z: number
}

// El servidor es el mismo que entrega esta página. Mientras se desarrolla, Vite le pasa la conexión,
// así la cookie de la cuenta llega igual que en producción
export const socket = io()

let lastSentAt = 0
let lastX = NaN
let lastZ = NaN

let lastStatus = ''

let token: string = crypto.randomUUID()
let session: Session | null = null
let seatLostListener = () => {}

export function onSeatLost(listener: () => void) {
  seatLostListener = listener
}

// sessionStorage es de cada pestaña y sobrevive a una recarga: dos pestañas son dos personas
function loadSavedSession(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
  } catch {
    return null
  }
}

function startSession(code: string, nickname: string) {
  session = { token, code, nickname }

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Sin almacenamiento todo funciona igual, pero al recargar se vuelve a la pantalla inicial
  }
}

export async function createRoom(nickname: string) {
  const code: string = await socket.emitWithAck('room:create', nickname, token)
  startSession(code, nickname)
  return code
}

export async function joinRoom(code: string, nickname: string) {
  const joined: boolean = await socket.emitWithAck('room:join', code, nickname, token)
  if (joined) {
    startSession(code, nickname)
  }
  return joined
}

// El servidor lee la cuenta al conectarse: hay que reconectar al iniciar o cerrar sesión
export function reconnect() {
  if (session) return // ya en una sala, la cuenta vale desde la próxima vez

  socket.disconnect()
  socket.connect()
}

function waitForConnection() {
  return new Promise<boolean>((resolve) => {
    if (socket.connected) {
      resolve(true)
      return
    }

    const timeout = setTimeout(() => resolve(false), CONNECT_TIMEOUT)
    socket.once('connect', () => {
      clearTimeout(timeout)
      resolve(true)
    })
  })
}

// Al abrir la página: vuelve a la sala si esta pestaña ya estaba en ella
export async function resumeSavedRoom(code: string) {
  const saved = loadSavedSession()
  if (saved?.code !== code || !(await waitForConnection())) return null

  const resumed: ResumedPlayer | null = await socket.emitWithAck('room:resume', saved.token)
  if (resumed) {
    token = saved.token
    session = saved
  }
  return resumed
}

socket.on('connect', async () => {
  lastX = NaN
  lastZ = NaN
  lastStatus = ''

  if (!session) return

  const resumed: ResumedPlayer | null = await socket.emitWithAck('room:resume', token)
  if (resumed) return

  // Tardó demasiado en volver: el servidor ya liberó su lugar
  seatLostListener()
  const joined = await joinRoom(session.code, session.nickname)
  if (!joined) {
    window.location.href = window.location.pathname
  }
})

socket.on('disconnect', () => {
  console.log('Desconectado del servidor')
})

export function sendPosition(x: number, z: number) {
  const now = performance.now()
  if (now - lastSentAt < SEND_INTERVAL) return
  if (x === lastX && z === lastZ) return

  lastSentAt = now
  lastX = x
  lastZ = z
  socket.emit('player:move', { x, z })
}

export function sendStatus(status: { activity: ActivityKind; period: Period; isRunning: boolean }) {
  const serialized = JSON.stringify(status)
  if (serialized === lastStatus) return

  lastStatus = serialized
  socket.emit('player:status', status)
}

export async function takeSeat(seatId: number) {
  const taken: boolean = await socket.emitWithAck('seat:take', seatId)
  return taken
}

export function leaveSeat() {
  socket.emit('seat:leave')
}