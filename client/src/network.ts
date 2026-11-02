import { io } from 'socket.io-client'

const SERVER_URL = 'http://localhost:3000'

export const socket = io(SERVER_URL)

socket.on('connect', () => {
  console.log(`Conectado al servidor con id ${socket.id}`)
})

socket.on('disconnect', () => {
  console.log('Desconectado del servidor')
})