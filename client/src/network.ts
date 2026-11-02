import { io } from 'socket.io-client'

const SERVER_URL = 'http://localhost:3000'
const SEND_INTERVAL = 66 // milisegundos, unas 15 veces por segundo

export const socket = io(SERVER_URL)

let lastSentAt = 0
let lastX = NaN
let lastZ = NaN

function enterRoom() {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('sala')

  if (code) {
    socket.emit('room:join', code, (joined: boolean) => {
      console.log(joined ? `Dentro de la sala ${code}` : `La sala ${code} no existe`)
    })
    return
  }

  socket.emit('room:create', (newCode: string) => {
    console.log(`Sala creada: ${newCode}`)
    url.searchParams.set('sala', newCode)
    window.history.replaceState(null, '', url)
  })
}

socket.on('connect', () => {
  console.log(`Conectado al servidor con id ${socket.id}`)
  lastX = NaN
  lastZ = NaN
  enterRoom()
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