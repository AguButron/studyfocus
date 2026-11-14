import { CHAIR_SIZE, getRoomLayout, layoutSeats, TABLE_DEPTH, tableWidth, type Decor } from './roomLayout'

// Qué hace quien ocupa cada silla, por su número
export type SeatState = 'study' | 'break'

// Lo que ocupa cada mueble en el piso, visto desde arriba: el resto de los adornos no se dibuja en el plano
function decorFootprint(item: Decor) {
  const turned = item.facing === 90 || item.facing === 270
  const along = item.width ?? 0
  if (item.kind === 'rug') return { x: item.x, z: item.z, width: item.width ?? 2, depth: item.depth ?? 3, className: 'sf-plan-rug' }
  if (item.kind !== 'shelf' && item.kind !== 'counter' && item.kind !== 'cabinet') return null
  const deep = item.depth ?? (item.kind === 'counter' ? 0.8 : item.kind === 'cabinet' ? 0.5 : 0.4)
  // Va con su parte de atrás en x, z: el centro queda hacia donde mira
  const angle = ((item.facing ?? 0) * Math.PI) / 180
  return {
    x: item.x + Math.sin(angle) * (deep / 2),
    z: item.z + Math.cos(angle) * (deep / 2),
    width: turned ? deep : along,
    depth: turned ? along : deep,
    className: 'sf-plan-furniture',
  }
}

// Una sala vista desde arriba, con las mismas mesas y sillas que la escena 3D. kind: el tipo de sala
export function drawRoomPlan(seatStates = new Map<number, SeatState>(), kind = 'study') {
  const layout = getRoomLayout(kind)
  const shapes: string[] = []

  function addRect(className: string, x: number, z: number, width: number, depth: number, state?: SeatState) {
    const taken = state ? ` data-taken="${state}"` : ''
    shapes.push(
      `<rect class="${className}"${taken} x="${x - width / 2}" y="${z - depth / 2}" width="${width}" height="${depth}" rx="0.06" />`,
    )
  }

  // Primero lo de abajo: las alfombras y los muebles, más tenues; encima, las mesas y las sillas
  for (const item of layout.decor) {
    const footprint = decorFootprint(item)
    if (footprint) addRect(footprint.className, footprint.x, footprint.z, footprint.width, footprint.depth)
  }
  for (const table of layout.tables) {
    addRect('sf-plan-table', table.x, table.z, tableWidth(table), TABLE_DEPTH)
  }
  for (const seat of layoutSeats(layout)) {
    addRect('sf-plan-seat', seat.x, seat.z, CHAIR_SIZE, CHAIR_SIZE, seatStates.get(seat.id))
  }

  // Toda la sala, con sus paredes
  const margin = 0.2
  const viewBox = [-layout.width / 2 - margin, -layout.depth / 2 - margin, layout.width + margin * 2, layout.depth + margin * 2].join(' ')
  const walls = `<rect class="sf-plan-walls" x="${-layout.width / 2}" y="${-layout.depth / 2}" width="${layout.width}" height="${layout.depth}" rx="0.1" />`
  return `<svg viewBox="${viewBox}">${walls}${shapes.join('')}</svg>`
}
