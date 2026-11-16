import type { loadStats } from './stats.ts'

// Las medallas: cada una se gana al llegar a su meta, calculada con las estadísticas de la persona,
// así que cuenta todo lo que ya hizo. Se muestran en su perfil, a quien puede ver sus estadísticas.
// Para agregar una: su entrada aquí y la traducción de su nombre y descripción en client/src/en.ts.

type Stats = Awaited<ReturnType<typeof loadStats>>

interface Medal {
  id: string
  name: string
  description: string
  goal: number
  value: (stats: Stats) => number // cuánto lleva, en la misma unidad que goal
}

// Ejemplo: { id: 'primeras-10-horas', name: '10 horas', description: 'Estudia 10 horas en total.', goal: 10 * 3600, value: (stats) => stats.total }
export const MEDALS: Medal[] = []

export function describeMedals(stats: Stats) {
  return MEDALS.map(({ id, name, description, goal, value }) => ({ id, name, description, earned: value(stats) >= goal }))
}
