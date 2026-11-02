import { io } from 'socket.io-client'

const SERVER_URL = 'http://localhost:3000'
const SEND_INTERVAL = 66 // milisegundos, unas 15 veces por segundo

export const socket = io(SERVER_URL)

let lastSentAt = 0
let lastX = NaN
let lastZ = NaN

let session: { code: string; nickname: string } | null = null

export async function createRoom(nickname: string) {
  const code: string = await socket.emitWithAck('room:create', nickname)
  session = { code, nickname }
  return code
}

export async function joinRoom(code: string, nickname: string) {
  const joined: boolean = await socket.emitWithAck('room:join', code, nickname)
  if (joined) {
    session = { code, nickname }
  }
  return joined
}

socket.on('connect', async () => {
  lastX = NaN
  lastZ = NaN

  if (!session) return

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

export async function takeSeat(seatId: number) {
  const taken: boolean = await socket.emitWithAck('seat:take', seatId)
  return taken
}

export function leaveSeat() {
  socket.emit('seat:leave')
}