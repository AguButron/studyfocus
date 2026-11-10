// Si cada cuenta está conectada y qué hace, para que sus amigos lo vean. Vive en la memoria, igual que las salas.
// - En una sala (o estudiando solo): lo dice la sala.
// - Con StudyFocus abierto en alguna pestaña: "En línea", o "Ausente" si no lo usa hace un rato.
// - Sin ninguna pestaña abierta: desconectada; la base guarda cuándo se fue (users.last_seen_at).
import { hasDatabase, query } from './database.ts'

export interface Presence {
  code: string
  kind: string // 'solo' es estudiar solo: los amigos lo ven, pero sin el código para entrar
  player: { period: string; isRunning: boolean } // el mismo objeto que se actualiza en la sala
}

export const AWAY_AFTER = 10 * 60 * 1000 // milisegundos sin usar la página para pasar a "Ausente"
const SOLO_KIND = 'solo'

const presences = new Map<string, Presence>()
// Las pestañas abiertas de cada cuenta, y cuándo se usó la página por última vez
const connections = new Map<string, { sockets: Set<string>; lastActive: number }>()

export function setPresence(accountId: string, presence: Presence) {
  presences.set(accountId, presence)
}

// Con dos pestañas, solo la que quedó registrada al último borra la presencia
export function clearPresence(accountId: string, presence: Presence) {
  if (presences.get(accountId) === presence) {
    presences.delete(accountId)
  }
}

// Una pestaña con la sesión iniciada se conectó
export function addConnection(accountId: string, socketId: string) {
  const connection = connections.get(accountId) ?? { sockets: new Set<string>(), lastActive: 0 }
  connection.sockets.add(socketId)
  connection.lastActive = Date.now()
  connections.set(accountId, connection)
}

// Se cerró una pestaña. Si era la última, se anota cuándo se fue
export function removeConnection(accountId: string, socketId: string) {
  const connection = connections.get(accountId)
  if (!connection) return
  connection.sockets.delete(socketId)
  if (connection.sockets.size > 0) return
  connections.delete(accountId)
  if (hasDatabase()) {
    query('UPDATE users SET last_seen_at = now() WHERE id = $1', [accountId]).catch((error) =>
      console.error('No se pudo anotar la última conexión:', error),
    )
  }
}

// La persona usó la página: un clic, una tecla, volver a la pestaña
export function markActive(accountId: string) {
  const connection = connections.get(accountId)
  if (connection) connection.lastActive = Date.now()
}

export function isConnected(accountId: string) {
  return connections.has(accountId)
}

// status: 'room' (en una sala), 'solo' (estudiando solo), 'online' o 'away'. Nulo: desconectada
export function getPresence(accountId: string) {
  const presence = presences.get(accountId)
  if (presence) {
    const isSolo = presence.kind === SOLO_KIND
    return {
      status: isSolo ? 'solo' : 'room',
      code: isSolo ? null : presence.code,
      isSolo,
      period: presence.player.period,
      isRunning: presence.player.isRunning,
    }
  }
  const connection = connections.get(accountId)
  if (!connection) return null
  return {
    status: Date.now() - connection.lastActive > AWAY_AFTER ? 'away' : 'online',
    code: null,
    isSolo: false,
    period: null,
    isRunning: false,
  }
}
