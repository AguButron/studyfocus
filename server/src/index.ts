import { Server } from 'socket.io'

const PORT = 3000
const CLIENT_URL = 'http://localhost:5173'

interface PlayerState {
  id: string
  x: number
  z: number
}

const players = new Map<string, PlayerState>()

const io = new Server(PORT, {
  cors: { origin: CLIENT_URL },
})

io.on('connection', (socket) => {
  console.log(`Conectado: ${socket.id}`)

  const player: PlayerState = { id: socket.id, x: 0, z: 0 }

  socket.emit('players:init', [...players.values()])
  players.set(socket.id, player)
  socket.broadcast.emit('player:joined', player)

  socket.on('player:move', (position: { x: number; z: number }) => {
    player.x = position.x
    player.z = position.z
    socket.broadcast.emit('player:moved', player)
  })

  socket.on('disconnect', () => {
    console.log(`Desconectado: ${socket.id}`)
    players.delete(socket.id)
    io.emit('player:left', socket.id)
  })
})

console.log(`Servidor escuchando en el puerto ${PORT}`)