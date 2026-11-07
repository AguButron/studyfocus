import { hasDatabase, query } from './database.ts'

// Una sala se borra cuando queda vacía. Mientras tiene gente, su fila sirve para que, si el servidor
// se reinicia (por ejemplo, al publicar un cambio), quienes estaban en ella puedan volver a entrar.
// Lo que pasa dentro de la sala sigue en la memoria: aquí solo queda que existe, de quién es y de qué tipo.

const ORPHAN_WAIT = 10 // minutos: tras un reinicio, lo que tienen para volver a su sala

export async function saveRoom(code: string, ownerId: string, kind: string) {
  const { rows } = await query(
    'INSERT INTO rooms (code, owner_id, kind) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING RETURNING code',
    [code, ownerId, kind],
  )
  return rows.length > 0
}

// Marca la sala como usada. Falso si no existe: nunca existió o ya quedó vacía.
export async function touchSavedRoom(code: string) {
  if (!hasDatabase()) return false

  const { rows } = await query('UPDATE rooms SET last_used_at = now() WHERE code = $1 RETURNING code', [code])
  return rows.length > 0
}

export async function deleteSavedRoom(code: string) {
  if (!hasDatabase()) return

  await query('DELETE FROM rooms WHERE code = $1', [code])
}

// Las salas que tenían gente cuando el servidor se reinició y a las que nadie volvió
export async function deleteAbandonedRooms(activeCodes: string[]) {
  if (!hasDatabase()) return 0

  const { rowCount } = await query(
    `DELETE FROM rooms WHERE code <> ALL($1::text[]) AND last_used_at < now() - make_interval(mins => $2)`,
    [activeCodes, ORPHAN_WAIT],
  )
  return rowCount ?? 0
}
