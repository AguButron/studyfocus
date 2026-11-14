// Los tipos de sala que se pueden crear, de la más chica a la más grande. El servidor acepta solo estos
// identificadores, y en cada una caben tantas personas como sillas tiene. Cómo se ve cada una está en roomLayout.
// Ver docs/decisiones/0031-tipos-de-sala.md
export interface RoomKind {
  id: string
  name: string
  seats: number
  description: string
}

export const ROOM_KINDS: RoomKind[] = [
  // 'solo' es tu escritorio (deskScene.ts): un rincón solo tuyo, al que nadie más puede entrar ni con el código
  { id: 'solo', name: 'Estudio individual', seats: 1, description: 'Tu escritorio, solo para ti. Nadie más puede entrar.' },
  { id: 'duo', name: 'Estudio de a dos', seats: 2, description: 'Frente a frente, junto a una ventana.' },
  { id: 'group', name: 'Sala de grupo', seats: 4, description: 'Una mesa y una pizarra, para estudiar en grupo.' },
  { id: 'cafe', name: 'Café', seats: 8, description: 'Mesitas de a dos y la barra al fondo.' },
  { id: 'library', name: 'Biblioteca', seats: 12, description: 'Mesas largas y estantes llenos de libros.' },
  // 'study' es el identificador de siempre: así las salas guardadas antes siguen siendo esta
  { id: 'study', name: 'Salón de estudio', seats: 16, description: 'Cuatro mesas, para un curso entero.' },
]

export const DEFAULT_ROOM_KIND = 'group'
export const SOLO_ROOM_KIND = 'solo'

export function getRoomKind(id: string) {
  return ROOM_KINDS.find((kind) => kind.id === id) ?? ROOM_KINDS[ROOM_KINDS.length - 1]
}
