import { RequestError } from './requests.ts'

// Cómo se ve el personaje de cada persona. De él sale también su foto, así que nadie sube imágenes.
// Hoy es solo el color del cubo; el creador de personajes agregará más datos a la misma ficha.

// Los mismos colores que ofrece la página, para que todos los personajes combinen con la sala
export const CHARACTER_COLORS = [
  '#89b4fa', // azul
  '#f38ba8', // rosado
  '#a6e3a1', // verde
  '#f9e2af', // amarillo
  '#fab387', // durazno
  '#cba6f7', // lila
  '#94e2d5', // turquesa
  '#f5f5f5', // blanco
]

export interface Character {
  color: string
}

// Quien aún no eligió tiene un color fijo según su cuenta: así no se ven todos iguales
export function describeCharacter(saved: unknown, accountId: string): Character {
  const color = (saved as Partial<Character> | null)?.color
  if (typeof color === 'string' && CHARACTER_COLORS.includes(color)) return { color }

  return { color: CHARACTER_COLORS[Number(BigInt(accountId) % BigInt(CHARACTER_COLORS.length))] }
}

export function parseCharacter(body: Record<string, unknown>): Character {
  const color = typeof body.color === 'string' ? body.color.toLowerCase() : null
  if (!color || !CHARACTER_COLORS.includes(color)) throw new RequestError(400, 'Elige uno de los colores.')
  return { color }
}
