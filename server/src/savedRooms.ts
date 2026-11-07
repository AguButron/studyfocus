import { hasDatabase, query } from './database.ts'

const MAX_LISTED_ROOMS = 20

// Las salas de quien tiene cuenta se guardan para que su link siga sirviendo después de un reinicio.
// Lo que pasa dentro de la sala sigue en la memoria: aquí solo queda que existe y de quién es.

export async function isCodeSaved(code: string) {
  if (!hasDatabase()) return false

  const { rows } = await query('SELECT 1 FROM rooms WHERE code = $1', [code])
  return rows.length > 0
}

export async function saveRoom(code: string, ownerId: string) {
  const { rows } = await query(
    'INSERT INTO rooms (code, owner_id) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING RETURNING code',
    [code, ownerId],
  )
  return rows.length > 0
}

// Marca la sala como usada, y así la lista de cada persona muestra primero las más recientes
export async function touchSavedRoom(code: string) {
  if (!hasDatabase()) return false

  const { rows } = await query('UPDATE rooms SET last_used_at = now() WHERE code = $1 RETURNING code', [code])
  return rows.length > 0
}

export async function listRooms(ownerId: string) {
  const { rows } = await query<{ code: string }>(
    'SELECT code FROM rooms WHERE owner_id = $1 ORDER BY last_used_at DESC LIMIT $2',
    [ownerId, MAX_LISTED_ROOMS],
  )
  return rows.map((row) => row.code)
}
