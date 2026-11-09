// Las clases de cada semana de un ramo: los días, los tipos y cómo se describen en una línea
import type { ClassBlock } from './spaces'

export const DAYS = [
  { id: 1, name: 'Lunes', short: 'Lun' },
  { id: 2, name: 'Martes', short: 'Mar' },
  { id: 3, name: 'Miércoles', short: 'Mié' },
  { id: 4, name: 'Jueves', short: 'Jue' },
  { id: 5, name: 'Viernes', short: 'Vie' },
  { id: 6, name: 'Sábado', short: 'Sáb' },
  { id: 7, name: 'Domingo', short: 'Dom' },
]

export const CLASS_KINDS = ['Clase', 'Taller', 'Ayudantía', 'Laboratorio']
export const MAX_CLASSES = 20 // por ramo

// "Clase Lun y Mié 10:00–11:20 · Ayudantía Vie 14:50–16:00": las que comparten hora y tipo van juntas
export function describeClasses(blocks: ClassBlock[]) {
  const groups = new Map<string, { days: number[]; item: ClassBlock }>()
  for (const item of blocks) {
    const key = `${item.start}|${item.end}|${item.kind ?? ''}`
    const group = groups.get(key)
    if (group) group.days.push(item.day)
    else groups.set(key, { days: [item.day], item })
  }
  return [...groups.values()]
    .map(({ days, item }) => {
      const names = days.map((day) => DAYS[day - 1]?.short ?? '')
      const joined = names.length <= 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
      return `${item.kind ? `${item.kind} ` : ''}${joined} ${item.start}–${item.end}`
    })
    .join(' · ')
}
