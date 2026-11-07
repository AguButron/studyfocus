import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // Google lo pide para que su botón funcione en http://localhost
    headers: { 'Referrer-Policy': 'no-referrer-when-downgrade' },
    // Así la cookie de la cuenta es del mismo sitio, igual que en producción
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
})
