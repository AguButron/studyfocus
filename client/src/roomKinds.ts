// Los tipos de sala que se pueden crear. El servidor acepta solo estos identificadores.
export interface RoomKind {
  id: string
  name: string
}

export const ROOM_KINDS: RoomKind[] = [
  {
    id: 'study',
    name: 'Sala de estudio',
  },
]

export function getRoomKind(id: string) {
  return ROOM_KINDS.find((kind) => kind.id === id) ?? ROOM_KINDS[0]
}
