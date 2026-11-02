import { io } from 'socket.io-client'

const SERVER_URL = 'http://localhost:3000'
const SEND_INTERVAL = 66 // milisegundos, unas 15 veces por segundo

export const socket = io(SERVER_URL)

let lastSentAt = 0
let lastX = NaN
let lastZ = NaN

socket.on('connect', () => {
  console.log(`Conectado al servidor con id ${socket.id}`)
  lastX = NaN
  lastZ = NaN
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