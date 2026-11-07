import { CHAIR_SIZE, seats, TABLE_DEPTH, TABLE_WIDTH } from './room'

// Qué hace quien ocupa cada silla, por su número
export type SeatState = 'study' | 'break'

// La sala vista desde arriba, con las mismas mesas y sillas que la escena 3D
export function drawRoomPlan(seatStates = new Map<number, SeatState>()) {
  const shapes: string[] = []
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  function addRect(className: string, x: number, z: number, width: number, depth: number, state?: SeatState) {
    minX = Math.min(minX, x - width / 2)
    maxX = Math.max(maxX, x + width / 2)
    minZ = Math.min(minZ, z - depth / 2)
    maxZ = Math.max(maxZ, z + depth / 2)
    const taken = state ? ` data-taken="${state}"` : ''
    shapes.push(
      `<rect class="${className}"${taken} x="${x - width / 2}" y="${z - depth / 2}" width="${width}" height="${depth}" rx="0.06" />`,
    )
  }

  const tables = new Map(seats.map((seat) => [`${seat.tableX},${seat.tableZ}`, seat]))
  for (const seat of tables.values()) {
    addRect('sf-plan-table', seat.tableX, seat.tableZ, TABLE_WIDTH, TABLE_DEPTH)
  }
  for (const seat of seats) {
    addRect('sf-plan-seat', seat.x, seat.z, CHAIR_SIZE, CHAIR_SIZE, seatStates.get(seat.id))
  }

  const margin = 0.5
  const viewBox = [minX - margin, minZ - margin, maxX - minX + margin * 2, maxZ - minZ + margin * 2].join(' ')
  return `<svg viewBox="${viewBox}">${shapes.join('')}</svg>`
}
