import { Server } from 'socket.io'

const PORT = 3000
const CLIENT_URL = 'http://localhost:5173'

const io = new Server(PORT, {
  cors: { origin: CLIENT_URL },
})

io.on('connection', (socket) => {
  console.log(`Conectado: ${socket.id}`)

  socket.on('disconnect', () => {
    console.log(`Desconectado: ${socket.id}`)
  })
})

console.log(`Servidor escuchando en el puerto ${PORT}`)