// En qué sala está cada cuenta ahora, para que sus amigos lo vean. Vive en la memoria, igual que las salas.

export interface Presence {
  code: string
  player: { period: string; isRunning: boolean } // el mismo objeto que se actualiza en la sala
}

const presences = new Map<string, Presence>()

export function setPresence(accountId: string, presence: Presence) {
  presences.set(accountId, presence)
}

// Con dos pestañas, solo la que quedó registrada al último borra la presencia
export function clearPresence(accountId: string, presence: Presence) {
  if (presences.get(accountId) === presence) {
    presences.delete(accountId)
  }
}

export function getPresence(accountId: string) {
  const presence = presences.get(accountId)
  if (!presence) return null

  return { code: presence.code, period: presence.player.period, isRunning: presence.player.isRunning }
}
