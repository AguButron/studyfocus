import { CHARACTER_COLORS, type Character } from './character'
import { createCharacterModel, paintCharacterModel } from './characterModel'
import { scene } from './scene'
import { leaveSeat, onSeatLost, takeSeat, type ResumedPlayer } from './network'
import { isSeatTaken } from './remotePlayers'
import { SEATED_Y, seats, type Seat } from './room'
import { isStudyRunning } from './timer'

// El personaje propio. En la sala no se camina: se elige una silla libre con un clic, y el personaje
// aparece sentado ahí. Mientras no tiene silla, no se ve.

export const player = createCharacterModel({ color: CHARACTER_COLORS[0].color })
player.position.set(0, SEATED_Y, 0)
player.visible = false
scene.add(player)

export function setPlayerCharacter(character: Character) {
  paintCharacterModel(player, character)
}

let currentSeat: Seat | null = null
let isRequestingSeat = false
let seatListener: (seat: Seat | null) => void = () => {}

export function onSeatChange(listener: (seat: Seat | null) => void) {
  seatListener = listener
}

function sit(seat: Seat) {
  currentSeat = seat
  player.position.set(seat.x, SEATED_Y, seat.z)
  player.visible = true
  seatListener(seat)
}

function leaveCurrentSeat() {
  if (!currentSeat) return
  currentSeat = null
  player.visible = false
  seatListener(null)
}

onSeatLost(leaveCurrentSeat)

export function restorePlayer({ seatId }: ResumedPlayer) {
  if (seatId !== null && seats[seatId]) sit(seats[seatId])
}

export function isSeated() {
  return currentSeat !== null
}

// Sentarse en una silla libre. Si otra persona la tomó justo antes, el servidor la rechaza.
export async function pickSeat(seat: Seat) {
  if (isRequestingSeat || currentSeat || isSeatTaken(seat.id)) return false

  isRequestingSeat = true
  const taken = await takeSeat(seat.id)
  isRequestingSeat = false
  if (!taken || currentSeat) return false

  sit(seat)
  return true
}

// Cambiar de asiento: deja la silla y vuelve a la vista de la sala para elegir otra.
// Mientras corre un periodo de estudio no se puede.
export function changeSeat() {
  if (!currentSeat || isRequestingSeat || isStudyRunning()) return
  leaveSeat()
  leaveCurrentSeat()
}
