// Los tipos de sala que se pueden crear. El servidor acepta solo estos identificadores.
export interface RoomKind {
  id: string
  name: string
  description: string
  details: string
}

export const ROOM_KINDS: RoomKind[] = [
  {
    id: 'study',
    name: 'Sala de estudio',
    description: 'Mesas compartidas para estudiar en silencio, cada quien con su temporizador.',
    details: 'Hasta 12 personas · 16 sillas',
  },
]

export function getRoomKind(id: string) {
  return ROOM_KINDS.find((kind) => kind.id === id) ?? ROOM_KINDS[0]
}
