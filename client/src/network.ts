import { io } from 'socket.io-client'
import type { ActivityKind } from './choices'
import type { Character } from './character'
import type { StudySummary } from './stats'
import type { HandedTimer, Period } from './timer'

const SEND_INTERVAL = 66 // milisegundos, unas 15 veces por segundo
const SESSION_KEY = 'studyfocus.session'
const CONNECT_TIMEOUT = 3000 // milisegundos
const LEAVE_TIMEOUT = 5000 // milisegundos: el servidor arma el resumen antes de responder

interface Session {
  token: string
  code: string
}

export interface ResumedPlayer {
  code: string
  kind: string // 'solo' es estudiar solo, en la pantalla simple
  nickname: string
  character: Character
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
let rejoinedListener = () => {}

export function onSeatLost(listener: () => void) {
  seatLostListener = listener
}

// Se volvió a la sala tras perder la conexión: lo que pasó mientras tanto hay que pedirlo de nuevo (el chat de sala)
export function onRoomRejoined(listener: () => void) {
  rejoinedListener = listener
}

// sessionStorage es de cada pestaña y sobrevive a una recarga: dos pestañas son dos personas
function loadSavedSession(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
  } catch {
    return null
  }
}

function startSession(code: string) {
  session = { token, code }

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Sin almacenamiento todo funciona igual, pero al recargar se vuelve a la pantalla inicial
  }
}

// El apodo en la sala es el nombre de la cuenta: el servidor lo toma de ella. Responde el código, null si
// falló, o 'duplicate' si al estudiar solo tu cuenta ya lo hace en otra ventana. Con takeOver, esa sale y
// llega su temporizador, para seguir desde donde iba
export async function createRoom(
  kind: string,
  takeOver = false,
): Promise<{ code: string; timer: HandedTimer | null } | 'duplicate' | null> {
  const result: string | { code: string; timer: HandedTimer } | 'duplicate' | null = await socket.emitWithAck(
    'room:create',
    kind,
    token,
    takeOver,
  )
  if (!result) return null
  if (result === 'duplicate') return 'duplicate'
  const created = typeof result === 'string' ? { code: result, timer: null } : result
  startSession(created.code)
  return created
}

// 'joined', 'duplicate' (tu cuenta ya está en esa sala desde otra ventana) o 'failed' (no existe o está llena).
// Con takeOver, si ya estabas en ella, la otra ventana sale y entras desde esta
export async function joinRoom(
  code: string,
  takeOver = false,
): Promise<{ timer: HandedTimer | null; kind: string } | 'duplicate' | 'failed'> {
  // El servidor responde con el tipo de sala (que decide cómo se arma) y, si había, el temporizador de la otra ventana
  const result: boolean | { timer?: HandedTimer; kind?: string } | 'duplicate' = await socket.emitWithAck('room:join', code, token, takeOver)
  if (result === true || (typeof result === 'object' && result !== null)) {
    startSession(code)
    return result === true ? { timer: null, kind: 'study' } : { timer: result.timer ?? null, kind: result.kind ?? 'study' }
  }
  return result === 'duplicate' ? 'duplicate' : 'failed'
}

// Otra ventana de tu cuenta entró a esta sala y te reemplazó: esta pestaña ya no está en ella
let replacedListener = () => {}
export function onSessionReplaced(listener: () => void) {
  replacedListener = listener
}

socket.on('session:replaced', () => {
  session = null
  token = crypto.randomUUID()
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Sin almacenamiento no había nada guardado
  }
  replacedListener()
})

// Espera la respuesta para que el aviso alcance a salir antes de recargar la página
export async function leaveRoom() {
  const summary: StudySummary | null = await socket
    .timeout(LEAVE_TIMEOUT)
    .emitWithAck('room:leave')
    .catch(() => null)
  session = null
  token = crypto.randomUUID()

  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Sin almacenamiento no había nada guardado
  }
  return summary
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
  if (resumed) {
    // Tras un reinicio del servidor, alguien pudo haber tomado la silla mientras tanto
    if (resumed.seatId === null) seatLostListener()
    rejoinedListener()
    return
  }

  // Tardó demasiado en volver: el servidor ya liberó su lugar
  seatLostListener()
  const joined = typeof (await joinRoom(session.code)) === 'object'
  if (!joined) {
    window.location.href = window.location.pathname
    return
  }
  rejoinedListener()
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

export function sendStatus(status: {
  activity: ActivityKind
  period: Period
  isRunning: boolean
  isStarted: boolean // sentado sin empezar no hay nada sobre la mesa; en pausa, sí
  periodId: string
  sectionId: string | null
  // El temporizador completo, para seguir con él si la cuenta se cambia a otra ventana
  studyMinutes: number
  breakMinutes: number
  remainingMs: number
}) {
  // Corriendo, lo que falta cambia a cada rato: se manda solo cuando cambia otra cosa, y el servidor
  // descuenta lo que pasó desde entonces
  const serialized = JSON.stringify(status.isRunning ? { ...status, remainingMs: undefined } : status)
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
// "En línea" o "Ausente": la página avisa que la estás usando (un clic, una tecla, volver a la pestaña),
// como mucho una vez por minuto. Sin avisos por 10 minutos, tus amigos te ven como Ausente
const ACTIVE_INTERVAL = 60_000 // milisegundos
let lastActiveSent = 0

function reportActivity() {
  if (document.visibilityState !== 'visible') return
  const now = Date.now()
  if (now - lastActiveSent < ACTIVE_INTERVAL) return
  lastActiveSent = now
  socket.volatile.emit('presence:active') // sin conexión no sirve guardarlo para después
}

for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
  window.addEventListener(type, reportActivity, { passive: true })
}
document.addEventListener('visibilitychange', reportActivity)
// Al reconectar, el servidor parte contando desde ese momento
socket.on('connect', () => (lastActiveSent = Date.now()))
