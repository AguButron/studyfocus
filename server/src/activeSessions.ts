import { createHash } from 'node:crypto'
import { hasDatabase, query } from './database.ts'

// Lo mínimo para que, si el servidor se reinicia (por ejemplo, al publicar una versión nueva), cada persona
// vuelva a su silla con su periodo de estudio en curso. Lo demás de la sala sigue en la memoria.

const ABANDONED_AFTER = 15 // minutos sin guardarse: nadie volvió a esa sesión

export interface SavedSession {
  accountId: string
  code: string
  seatId: number | null
  x: number
  z: number
  activity: string
  period: string
  isRunning: boolean
  periodId: string | null
  pendingSegments: { start: number; end: number }[]
  pendingMs: number
  studiedMs: number
  joinedAt: number
}

interface SessionRow {
  user_id: string
  room_code: string
  seat_id: number | null
  x: number
  z: number
  activity: string
  period: string
  is_running: boolean
  period_id: string | null
  pending_segments: { start: number; end: number }[]
  pending_ms: number
  studied_ms: number
  joined_at: Date
}

// En la base solo queda un hash: quien la lea no puede hacerse pasar por nadie
function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function saveSession(token: string, session: SavedSession) {
  if (!hasDatabase()) return

  await query(
    `INSERT INTO active_sessions (token_hash, user_id, room_code, seat_id, x, z, activity, period, is_running,
       period_id, pending_segments, pending_ms, studied_ms, joined_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, to_timestamp($14 / 1000.0), now())
     ON CONFLICT (token_hash) DO UPDATE SET
       room_code = EXCLUDED.room_code, seat_id = EXCLUDED.seat_id, x = EXCLUDED.x, z = EXCLUDED.z,
       activity = EXCLUDED.activity, period = EXCLUDED.period, is_running = EXCLUDED.is_running,
       period_id = EXCLUDED.period_id, pending_segments = EXCLUDED.pending_segments,
       pending_ms = EXCLUDED.pending_ms, studied_ms = EXCLUDED.studied_ms, updated_at = now()`,
    [
      hashToken(token),
      session.accountId,
      session.code,
      session.seatId,
      session.x,
      session.z,
      session.activity,
      session.period,
      session.isRunning,
      session.periodId,
      JSON.stringify(session.pendingSegments),
      Math.round(session.pendingMs),
      Math.round(session.studiedMs),
      session.joinedAt,
    ],
  )
}

export async function loadSession(token: string): Promise<SavedSession | null> {
  if (!hasDatabase()) return null

  const { rows } = await query<SessionRow>('SELECT * FROM active_sessions WHERE token_hash = $1', [hashToken(token)])
  const row = rows[0]
  if (!row) return null

  return {
    accountId: row.user_id,
    code: row.room_code,
    seatId: row.seat_id,
    x: row.x,
    z: row.z,
    activity: row.activity,
    period: row.period,
    isRunning: row.is_running,
    periodId: row.period_id,
    pendingSegments: row.pending_segments,
    pendingMs: row.pending_ms,
    studiedMs: row.studied_ms,
    joinedAt: row.joined_at.getTime(),
  }
}

export async function deleteSession(token: string) {
  if (!hasDatabase()) return

  await query('DELETE FROM active_sessions WHERE token_hash = $1', [hashToken(token)])
}

export async function deleteAbandonedSessions() {
  if (!hasDatabase()) return

  await query('DELETE FROM active_sessions WHERE updated_at < now() - make_interval(mins => $1)', [ABANDONED_AFTER])
}
