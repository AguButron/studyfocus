import { randomInt } from 'node:crypto'
import { Server } from 'socket.io'

const PORT = 3000
const CLIENT_URL = 'http://localhost:5173'
const CODE_LENGTH = 6
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // sin letras y números fáciles de confundir

interface PlayerState {
  id: string
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

const io = new Server(PORT, {
  cors: { origin: CLIENT_URL },
})

io.on('connection', (socket) => {
  console.log(`Conectado: ${socket.id}`)

  const player: PlayerState = { id: socket.id, x: 0, z: 0 }
  let currentCode: string | null = null

  function enterRoom(code: string, room: Room) {
    socket.emit('players:init', [...room.values()])
    room.set(socket.id, player)
    socket.join(code)
    socket.to(code).emit('player:joined', player)
    currentCode = code
  }

  socket.on('room:create', (reply: (code: string) => void) => {
    if (currentCode) return

    const code = createRoomCode()
    const room: Room = new Map()
    rooms.set(code, room)
    enterRoom(code, room)
    console.log(`Sala creada: ${code}`)
    reply(code)
  })

  socket.on('room:join', (code: string, reply: (joined: boolean) => void) => {
    if (currentCode) return

    const room = rooms.get(code)
    if (!room) {
      reply(false)
      return
    }

    enterRoom(code, room)
    reply(true)
  })

  socket.on('player:move', (position: { x: number; z: number }) => {
    if (!currentCode) return

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