import { timingSafeEqual, createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Server } from 'socket.io'
import { formatSanctionDate, parseUsername, requireAccount, type Account } from './accounts.ts'
import { accountRoom } from './chat.ts'
import { hasDatabase, query } from './database.ts'
import { countLive } from './presence.ts'
import { allowAttempt, createJsonHandler, readBody, RequestError, sendJson } from './requests.ts'
import { ASSIGNABLE_ROLES, can, getRole, listPermissions, type Permission } from './roles.ts'
import { TIME_ZONES } from './stats.ts'

// El panel de administración: métricas, reportes, sanciones y roles. También recibe los reportes de
// cualquier persona (POST /api/reportes). Cada acción del equipo queda en admin_actions.

const ROLES_PASSWORD = process.env.ROLES_PASSWORD || null
const ROLES_UNLOCK_TIME = 15 * 60 * 1000 // milisegundos que dura la clave de roles una vez escrita
const MAX_ROLES_ATTEMPTS = 5 // cada 15 minutos
const MAX_REPORTS = 10 // por persona cada 15 minutos
const MAX_DETAILS = 500
const MAX_REASON = 300
const MAX_EXPORT_DAYS = 366
const DATE = /^\d{4}-\d{2}-\d{2}$/
const SANCTION_DAYS = [1, 3, 7, 30] // lo que se puede elegir al silenciar o suspender
export const REPORT_REASONS = ['spam', 'abuse', 'inappropriate', 'cheating', 'other']
const ID = /^\d{1,19}$/
// Las cuentas de prueba (testPeople.ts) no cuentan en las métricas: comparten la base con las reales
const REAL_USER = "coalesce(users.google_sub NOT LIKE 'prueba:%', true)"
const REAL = `user_id IN (SELECT id FROM users WHERE ${REAL_USER})` // para las tablas con user_id

const rolesUnlocked = new Map<string, number>() // cuenta → hasta cuándo puede tocar los roles sin otra clave
const mutedUntil = new Map<string, number>() // en memoria: el chat de sala lo revisa en cada mensaje

async function loadMutes() {
  const { rows } = await query<{ id: string; muted_until: Date }>('SELECT id::text, muted_until FROM users WHERE muted_until > now()')
  for (const row of rows) mutedUntil.set(row.id, row.muted_until.getTime())
}
if (hasDatabase()) loadMutes().catch((error) => console.error('No se pudieron cargar los silenciados:', error))

// El mensaje para quien está silenciado; nulo si puede escribir
export function describeMute(accountId: string) {
  const until = mutedUntil.get(accountId)
  if (!until || until <= Date.now()) return null
  return `Estás silenciado hasta el ${formatSanctionDate(new Date(until))}.`
}

const parseId = (value: unknown) => (typeof value === 'string' && ID.test(value) ? value : null)

async function requireStaff(request: IncomingMessage, permission: Permission) {
  const account = await requireAccount(request)
  const role = getRole(account)
  if (!can(role, permission)) throw new RequestError(403, 'No tienes permiso para esto.')
  return { account, role }
}

function isSamePassword(given: string, expected: string) {
  // Se comparan sus resúmenes, del mismo largo, para que el tiempo no delate cuántas letras coinciden
  const hash = (text: string) => createHash('sha256').update(text).digest()
  return timingSafeEqual(hash(given), hash(expected))
}

function requireRolesUnlocked(account: Account) {
  if ((rolesUnlocked.get(account.id) ?? 0) <= Date.now()) throw new RequestError(403, 'Escribe la clave de roles.')
}

// ── Métricas ───────────────────────────────────────────────────────────

async function loadMetrics(timeZone: string) {
  const live = countLive()
  const [users, series, study, features, retention, reports] = await Promise.all([
    query(
      `WITH people AS (
         SELECT users.id, users.created_at,
           greatest(users.last_seen_at, (SELECT max(ended_at) FROM study_segments WHERE user_id = users.id)) AS seen,
           users.id = ANY($1::bigint[]) AS connected,
           EXISTS (SELECT 1 FROM study_segments WHERE user_id = users.id) AS studied
         FROM users WHERE ${REAL_USER}
       )
       SELECT count(*)::int AS total,
         count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS new1,
         count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new7,
         count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new30,
         count(*) FILTER (WHERE connected OR seen > now() - interval '1 day')::int AS active1,
         count(*) FILTER (WHERE connected OR seen > now() - interval '7 days')::int AS active7,
         count(*) FILTER (WHERE connected OR seen > now() - interval '30 days')::int AS active30,
         count(*) FILTER (WHERE studied)::int AS activated
       FROM people`,
      [live.connectedIds],
    ),
    // shortcut: subconsultas por día, bien para miles de cuentas; con muchas más, agrupar en una sola pasada
    query(
      `WITH days AS (
         SELECT generate_series((now() AT TIME ZONE $1)::date - 29, (now() AT TIME ZONE $1)::date, interval '1 day')::date AS day
       )
       SELECT day::text AS date,
         (SELECT count(*) FROM users WHERE ${REAL_USER} AND (created_at AT TIME ZONE $1)::date = day)::int AS "newUsers",
         (SELECT count(DISTINCT user_id) FROM study_segments WHERE ${REAL} AND (started_at AT TIME ZONE $1)::date = day)::int AS studiers,
         (SELECT coalesce(sum(extract(epoch FROM ended_at - started_at)), 0) FROM study_segments
          WHERE ${REAL} AND (started_at AT TIME ZONE $1)::date = day)::int AS seconds
       FROM days ORDER BY day`,
      [timeZone],
    ),
    query(
      `SELECT coalesce(sum(extract(epoch FROM ended_at - started_at)), 0)::bigint AS total,
         coalesce(sum(extract(epoch FROM ended_at - started_at)) FILTER (WHERE started_at > now() - interval '7 days'), 0)::bigint AS week,
         count(DISTINCT user_id) FILTER (WHERE started_at > now() - interval '7 days')::int AS "weekStudiers"
       FROM study_segments WHERE ${REAL}`,
    ),
    query(
      `SELECT
         (SELECT count(*) FROM spaces WHERE ${REAL})::int AS spaces, (SELECT count(DISTINCT user_id) FROM spaces WHERE ${REAL})::int AS "spacesUsers",
         (SELECT count(*) FROM agenda_items WHERE ${REAL})::int AS agenda, (SELECT count(DISTINCT user_id) FROM agenda_items WHERE ${REAL})::int AS "agendaUsers",
         (SELECT count(*) FROM study_goals WHERE ${REAL})::int AS goals, (SELECT count(DISTINCT user_id) FROM study_goals WHERE ${REAL})::int AS "goalsUsers",
         (SELECT count(*) FROM syllabus_reads WHERE ${REAL})::int AS syllabus, (SELECT count(DISTINCT user_id) FROM syllabus_reads WHERE ${REAL})::int AS "syllabusUsers",
         (SELECT count(*) / 2 FROM friendships WHERE ${REAL})::int AS friendships, (SELECT count(DISTINCT user_id) FROM friendships WHERE ${REAL})::int AS "friendsUsers",
         (SELECT count(*) FROM messages WHERE from_id IN (SELECT id FROM users WHERE ${REAL_USER}) AND created_at > now() - interval '7 days')::int AS "messagesWeek",
         (SELECT count(DISTINCT from_id) FROM messages WHERE from_id IN (SELECT id FROM users WHERE ${REAL_USER}) AND created_at > now() - interval '7 days')::int AS "messagesUsers"`,
    ),
    // De quienes se registraron cada semana, cuántos volvieron a estudiar 1, 2, 3 y 4 semanas después
    query(
      `WITH cohort AS (
         SELECT id, created_at, date_trunc('week', created_at AT TIME ZONE $1)::date AS week
         FROM users WHERE ${REAL_USER} AND created_at > date_trunc('week', now() AT TIME ZONE $1) - interval '7 weeks'
       ), returned AS (
         SELECT cohort.id, floor(extract(epoch FROM study_segments.started_at - cohort.created_at) / 604800)::int AS offset_week
         FROM cohort JOIN study_segments ON study_segments.user_id = cohort.id
         WHERE study_segments.started_at >= cohort.created_at + interval '7 days'
       )
       SELECT week::text, count(*)::int AS size,
         ${[1, 2, 3, 4].map((n) => `count(*) FILTER (WHERE EXISTS (SELECT 1 FROM returned WHERE returned.id = cohort.id AND offset_week = ${n}))::int AS w${n}`).join(', ')}
       FROM cohort GROUP BY week ORDER BY week`,
      [timeZone],
    ),
    query(`SELECT count(*) FILTER (WHERE status = 'open')::int AS open, count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week FROM reports`),
  ])
  return {
    live: { connected: live.connected, inRooms: live.inRooms, studying: live.studying, openRooms: live.openRooms },
    users: users.rows[0],
    days: series.rows,
    study: study.rows[0],
    features: features.rows[0],
    retention: retention.rows,
    reports: reports.rows[0],
  }
}

// Las métricas de cada día entre dos fechas, para exportarlas (el cliente arma el CSV)
async function loadDailyMetrics(timeZone: string, from: string, to: string) {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000
  if (!(days >= 0)) throw new RequestError(400, 'Revisa las fechas.')
  if (days >= MAX_EXPORT_DAYS) throw new RequestError(400, `Elige un periodo de hasta ${MAX_EXPORT_DAYS} días.`)
  const perDay = (table: string, filter = REAL) =>
    `(SELECT count(*) FROM ${table} WHERE ${filter} AND (created_at AT TIME ZONE $1)::date = day)::int`
  // shortcut: subconsultas por día, bien para un año de datos con miles de cuentas; con muchas más, agrupar en una pasada
  const { rows } = await query(
    `WITH days AS (SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day)
     SELECT day::text AS date,
       (SELECT count(*) FROM users WHERE ${REAL_USER} AND (created_at AT TIME ZONE $1)::date = day)::int AS "newUsers",
       (SELECT count(DISTINCT user_id) FROM study_segments WHERE ${REAL} AND (started_at AT TIME ZONE $1)::date = day)::int AS studiers,
       (SELECT coalesce(sum(extract(epoch FROM ended_at - started_at)), 0) FROM study_segments
        WHERE ${REAL} AND (started_at AT TIME ZONE $1)::date = day)::int AS seconds,
       ${perDay('spaces')} AS spaces,
       ${perDay('agenda_items')} AS agenda,
       ${perDay('study_goals')} AS goals,
       ${perDay('syllabus_reads')} AS syllabus,
       ${perDay('messages', `from_id IN (SELECT id FROM users WHERE ${REAL_USER})`)} AS messages,
       (SELECT count(*) FROM reports WHERE (created_at AT TIME ZONE $1)::date = day)::int AS reports
     FROM days ORDER BY day`,
    [timeZone, from, to],
  )
  return rows
}

// ── Reportes ───────────────────────────────────────────────────────────

const PERSON = (alias: string) => `json_build_object('id', ${alias}.id::text, 'name', ${alias}.name, 'username', ${alias}.username)`

async function listReports(status: string) {
  const { rows } = await query(
    `SELECT reports.id::text, reports.reason, reports.details, reports.status, reports.created_at AS "createdAt",
       reports.resolved_at AS "resolvedAt", ${PERSON('reporter')} AS reporter, ${PERSON('reported')} AS reported,
       (SELECT count(*) FROM reports other WHERE other.reported_id = reports.reported_id)::int AS "reportedTotal",
       (SELECT count(*) FROM admin_actions WHERE target_id = reports.reported_id AND action IN ('warning', 'mute', 'suspend', 'ban'))::int AS "sanctions"
     FROM reports
     JOIN users reporter ON reporter.id = reports.reporter_id
     JOIN users reported ON reported.id = reports.reported_id
     WHERE ($1 = 'all' OR reports.status = $1)
     ORDER BY reports.created_at DESC LIMIT 100`,
    [status],
  )
  return rows
}

async function createReport(account: Account, body: Record<string, unknown>) {
  const username = parseUsername(body.username)
  const reason = typeof body.reason === 'string' && REPORT_REASONS.includes(body.reason) ? body.reason : null
  const details = typeof body.details === 'string' ? body.details.trim().slice(0, MAX_DETAILS) || null : null
  if (!username || !reason) throw new RequestError(400, 'Elige un motivo.')
  if (!allowAttempt(`report:${account.id}`, MAX_REPORTS)) throw new RequestError(429, 'Demasiados reportes. Prueba más tarde.')
  const { rows } = await query<{ id: string }>('SELECT id::text FROM users WHERE username = $1', [username])
  const reportedId = rows[0]?.id
  if (!reportedId) throw new RequestError(404, 'No encontrado.')
  if (reportedId === account.id) throw new RequestError(400, 'No puedes reportarte a ti.')
  const inserted = await query(
    `INSERT INTO reports (reporter_id, reported_id, reason, details) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [account.id, reportedId, reason, details],
  )
  if (inserted.rowCount === 0) throw new RequestError(409, 'Ya reportaste a esta persona. El equipo lo está revisando.')
}

// ── Usuarios y sanciones ───────────────────────────────────────────────

const USER_COLUMNS = `users.id::text, users.name, users.username, users.role, users.created_at AS "createdAt",
  users.last_seen_at AS "lastSeen", users.muted_until AS "mutedUntil", users.suspended_until AS "suspendedUntil",
  users.banned_at AS "bannedAt", users.google_sub IS NOT NULL AS "isGoogle",
  (SELECT count(*) FROM reports WHERE reported_id = users.id)::int AS "reportCount"`

async function searchUsers(text: string) {
  const pattern = `%${text.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`
  const { rows } = await query(
    `SELECT ${USER_COLUMNS} FROM users
     WHERE $1 = '%%' OR lower(users.username) LIKE $1 OR lower(users.name) LIKE $1 OR users.id::text = $2
     ORDER BY users.created_at DESC LIMIT 30`,
    [pattern, text],
  )
  return rows
}

async function loadUser(id: string) {
  const [user, actions, reports, study] = await Promise.all([
    query(`SELECT ${USER_COLUMNS}, users.bio FROM users WHERE id = $1`, [id]),
    query(
      `SELECT admin_actions.id::text, action, reason, until, admin_actions.created_at AS "createdAt", seen_at AS "seenAt",
         actor.name AS "actorName", actor.username AS "actorUsername"
       FROM admin_actions LEFT JOIN users actor ON actor.id = admin_actions.actor_id
       WHERE target_id = $1 ORDER BY admin_actions.created_at DESC LIMIT 50`,
      [id],
    ),
    query(
      `SELECT reports.id::text, reason, details, status, reports.created_at AS "createdAt", ${PERSON('reporter')} AS reporter
       FROM reports JOIN users reporter ON reporter.id = reports.reporter_id
       WHERE reported_id = $1 ORDER BY reports.created_at DESC LIMIT 50`,
      [id],
    ),
    query(`SELECT coalesce(sum(extract(epoch FROM ended_at - started_at)), 0)::bigint AS seconds FROM study_segments WHERE user_id = $1`, [id]),
  ])
  if (!user.rows[0]) throw new RequestError(404, 'No encontrado.')
  return { ...user.rows[0], studySeconds: Number(study.rows[0].seconds), actions: actions.rows, reports: reports.rows }
}

const SANCTION_PERMISSION: Record<string, Permission> = { warning: 'warn', mute: 'mute', unmute: 'mute', suspend: 'suspend', ban: 'ban', lift: 'suspend' }

async function applySanction(io: Server, actor: Account, body: Record<string, unknown>) {
  const kind = typeof body.kind === 'string' ? body.kind : ''
  const permission = SANCTION_PERMISSION[kind]
  const targetId = parseId(body.userId)
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, MAX_REASON) : ''
  const days = typeof body.days === 'number' && SANCTION_DAYS.includes(body.days) ? body.days : null
  if (!permission || !targetId) throw new RequestError(400, 'Formato no válido.')
  if (!can(getRole(actor), permission)) throw new RequestError(403, 'No tienes permiso para esto.')
  if ((kind === 'warning' || kind === 'mute' || kind === 'suspend' || kind === 'ban') && !reason) throw new RequestError(400, 'Escribe el motivo.')
  if ((kind === 'mute' || kind === 'suspend') && !days) throw new RequestError(400, 'Elige cuántos días.')
  if (targetId === actor.id) throw new RequestError(400, 'No puedes sancionarte a ti.')

  const { rows } = await query<{ username: string | null; role: string | null }>('SELECT username, role FROM users WHERE id = $1', [targetId])
  if (!rows[0]) throw new RequestError(404, 'No encontrado.')
  // Al equipo solo lo sanciona el dueño, y al dueño nadie
  const targetRole = getRole(rows[0])
  if (targetRole === 'owner' || (targetRole && getRole(actor) !== 'owner')) throw new RequestError(403, 'No puedes sancionar a alguien del equipo.')

  const until = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null
  if (kind === 'mute') {
    await query('UPDATE users SET muted_until = $2 WHERE id = $1', [targetId, until])
    mutedUntil.set(targetId, until!.getTime())
  } else if (kind === 'unmute') {
    await query('UPDATE users SET muted_until = NULL WHERE id = $1', [targetId])
    mutedUntil.delete(targetId)
  } else if (kind === 'suspend' || kind === 'ban') {
    await query(kind === 'ban' ? 'UPDATE users SET banned_at = now() WHERE id = $1' : 'UPDATE users SET suspended_until = $2 WHERE id = $1', kind === 'ban' ? [targetId] : [targetId, until])
    // Se cierran sus sesiones y sus pestañas abiertas
    await query('DELETE FROM account_sessions WHERE user_id = $1', [targetId])
    io.in(accountRoom(targetId)).disconnectSockets(true)
  } else if (kind === 'lift') {
    await query('UPDATE users SET suspended_until = NULL, banned_at = NULL, muted_until = NULL WHERE id = $1', [targetId])
    mutedUntil.delete(targetId)
  }
  await query('INSERT INTO admin_actions (actor_id, target_id, action, reason, until) VALUES ($1, $2, $3, $4, $5)', [
    actor.id,
    targetId,
    kind,
    reason || null,
    until,
  ])
  // Si venía de un reporte, queda cerrado con esta acción
  const reportId = parseId(body.reportId)
  if (reportId) {
    await closeReport(actor, reportId, 'resolved', null).catch((error) => {
      if (!(error instanceof RequestError)) throw error // otro ya lo había cerrado: la sanción vale igual
    })
  }
}

async function closeReport(actor: Account, id: string, status: 'resolved' | 'dismissed', note: string | null) {
  const { rows } = await query<{ reported_id: string }>(
    `UPDATE reports SET status = $2, resolved_by = $3, resolved_at = now() WHERE id = $1 AND status = 'open' RETURNING reported_id::text`,
    [id, status, actor.id],
  )
  if (!rows[0]) throw new RequestError(404, 'Ese reporte ya estaba cerrado.')
  await query('INSERT INTO admin_actions (actor_id, target_id, action, reason) VALUES ($1, $2, $3, $4)', [
    actor.id,
    rows[0].reported_id,
    status === 'resolved' ? 'report_resolved' : 'report_dismissed',
    note,
  ])
}

async function listLog() {
  const { rows } = await query(
    `SELECT admin_actions.id::text, action, reason, until, admin_actions.created_at AS "createdAt",
       ${PERSON('actor')} AS actor, ${PERSON('target')} AS target
     FROM admin_actions
     LEFT JOIN users actor ON actor.id = admin_actions.actor_id
     LEFT JOIN users target ON target.id = admin_actions.target_id
     ORDER BY admin_actions.created_at DESC LIMIT 100`,
  )
  return rows
}

// Borrar una cuenta con todo lo suyo (las tablas borran en cascada), sin dejar nada en el registro.
// Pide la clave de roles cada vez. Al equipo solo lo borra el dueño, y al dueño nadie
async function deleteUser(io: Server, actor: Account, body: Record<string, unknown>) {
  const targetId = parseId(body.userId)
  if (!targetId) throw new RequestError(400, 'Formato no válido.')
  if (!ROLES_PASSWORD) throw new RequestError(503, 'Falta ROLES_PASSWORD en server/.env.')
  if (!allowAttempt(`roles:${actor.id}`, MAX_ROLES_ATTEMPTS)) throw new RequestError(429, 'Demasiados intentos. Prueba en 15 minutos.')
  if (typeof body.password !== 'string' || !isSamePassword(body.password, ROLES_PASSWORD)) throw new RequestError(401, 'Clave incorrecta.')
  if (targetId === actor.id) throw new RequestError(400, 'No puedes borrar tu propia cuenta desde aquí.')
  const { rows } = await query<{ username: string | null; role: string | null }>('SELECT username, role FROM users WHERE id = $1', [targetId])
  if (!rows[0]) throw new RequestError(404, 'No encontrado.')
  const targetRole = getRole(rows[0])
  if (targetRole === 'owner' || (targetRole && getRole(actor) !== 'owner')) throw new RequestError(403, 'No puedes borrar a alguien del equipo.')
  io.in(accountRoom(targetId)).disconnectSockets(true)
  await query('DELETE FROM users WHERE id = $1', [targetId])
  mutedUntil.delete(targetId)
}

// ── Roles ──────────────────────────────────────────────────────────────

async function listStaff() {
  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users WHERE role IS NOT NULL ORDER BY role, name`)
  return rows
}

async function setRole(actor: Account, body: Record<string, unknown>) {
  const username = parseUsername(body.username)
  const role = body.role === null ? null : ASSIGNABLE_ROLES.find((option) => option === body.role)
  if (!username || role === undefined) throw new RequestError(400, 'Formato no válido.')
  const { rows } = await query<{ id: string; username: string; role: string | null }>('SELECT id::text, username, role FROM users WHERE username = $1', [username])
  if (!rows[0]) throw new RequestError(404, 'No hay nadie con ese usuario.')
  if (getRole(rows[0]) === 'owner') throw new RequestError(400, 'El rol del dueño se cambia en el servidor.')
  await query('UPDATE users SET role = $2 WHERE id = $1', [rows[0].id, role])
  await query(`INSERT INTO admin_actions (actor_id, target_id, action, reason) VALUES ($1, $2, 'role', $3)`, [actor.id, rows[0].id, role ?? 'none'])
}

// ── Rutas ──────────────────────────────────────────────────────────────

async function handleRequest(io: () => Server, request: IncomingMessage, response: ServerResponse) {
  if (!hasDatabase()) throw new RequestError(503, 'No disponible ahora.')
  const url = new URL(request.url ?? '/', 'http://localhost')
  const route = `${request.method} ${url.pathname}`

  if (route === 'POST /api/reportes') {
    await createReport(await requireAccount(request), await readBody(request))
    sendJson(response, 200, {})
    return
  }
  if (route === 'GET /api/admin/yo') {
    const account = await requireAccount(request)
    const role = getRole(account)
    if (!role) throw new RequestError(403, 'No tienes permiso para esto.')
    const unlocked = (rolesUnlocked.get(account.id) ?? 0) > Date.now()
    sendJson(response, 200, { role, permissions: listPermissions(role), rolesUnlocked: unlocked, hasRolesPassword: ROLES_PASSWORD !== null })
    return
  }
  if (route === 'GET /api/admin/metricas') {
    await requireStaff(request, 'metrics')
    const timeZone = url.searchParams.get('tz') ?? 'UTC'
    sendJson(response, 200, await loadMetrics(TIME_ZONES.has(timeZone) ? timeZone : 'UTC'))
    return
  }
  if (route === 'GET /api/admin/reportes') {
    await requireStaff(request, 'reports')
    const status = url.searchParams.get('estado') ?? 'open'
    sendJson(response, 200, { reports: await listReports(['open', 'resolved', 'dismissed', 'all'].includes(status) ? status : 'open') })
    return
  }
  if (route === 'POST /api/admin/reportes/cerrar') {
    const { account } = await requireStaff(request, 'reports')
    const body = await readBody(request)
    const id = parseId(body.id)
    if (!id || (body.status !== 'resolved' && body.status !== 'dismissed')) throw new RequestError(400, 'Formato no válido.')
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_REASON) || null : null
    await closeReport(account, id, body.status, note)
    sendJson(response, 200, {})
    return
  }
  if (route === 'GET /api/admin/usuarios') {
    await requireStaff(request, 'users')
    sendJson(response, 200, { users: await searchUsers((url.searchParams.get('q') ?? '').trim().slice(0, 40)) })
    return
  }
  if (route === 'GET /api/admin/usuario') {
    await requireStaff(request, 'users')
    const id = parseId(url.searchParams.get('id'))
    if (!id) throw new RequestError(400, 'Formato no válido.')
    sendJson(response, 200, await loadUser(id))
    return
  }
  if (route === 'POST /api/admin/sancion') {
    const { account } = await requireStaff(request, 'users')
    await applySanction(io(), account, await readBody(request))
    sendJson(response, 200, {})
    return
  }
  if (route === 'GET /api/admin/exportar') {
    await requireStaff(request, 'metrics')
    const timeZone = url.searchParams.get('tz') ?? 'UTC'
    const from = url.searchParams.get('desde') ?? ''
    const to = url.searchParams.get('hasta') ?? ''
    if (!DATE.test(from) || !DATE.test(to)) throw new RequestError(400, 'Elige las dos fechas.')
    sendJson(response, 200, { days: await loadDailyMetrics(TIME_ZONES.has(timeZone) ? timeZone : 'UTC', from, to) })
    return
  }
  if (route === 'POST /api/admin/usuario/borrar') {
    const { account } = await requireStaff(request, 'delete')
    await deleteUser(io(), account, await readBody(request))
    sendJson(response, 200, {})
    return
  }
  if (route === 'GET /api/admin/registro') {
    await requireStaff(request, 'log')
    sendJson(response, 200, { actions: await listLog() })
    return
  }
  if (route === 'POST /api/admin/roles/clave') {
    const { account } = await requireStaff(request, 'roles')
    if (!ROLES_PASSWORD) throw new RequestError(503, 'Falta ROLES_PASSWORD en server/.env.')
    if (!allowAttempt(`roles:${account.id}`, MAX_ROLES_ATTEMPTS)) throw new RequestError(429, 'Demasiados intentos. Prueba en 15 minutos.')
    const password = (await readBody(request)).password
    if (typeof password !== 'string' || !isSamePassword(password, ROLES_PASSWORD)) throw new RequestError(401, 'Clave incorrecta.')
    rolesUnlocked.set(account.id, Date.now() + ROLES_UNLOCK_TIME)
    sendJson(response, 200, {})
    return
  }
  if (route === 'GET /api/admin/roles') {
    const { account } = await requireStaff(request, 'roles')
    requireRolesUnlocked(account)
    sendJson(response, 200, { staff: await listStaff() })
    return
  }
  if (route === 'POST /api/admin/roles') {
    const { account } = await requireStaff(request, 'roles')
    requireRolesUnlocked(account)
    await setRole(account, await readBody(request))
    sendJson(response, 200, { staff: await listStaff() })
    return
  }
  throw new RequestError(404, 'No encontrado.')
}

export function createAdminHandler(io: () => Server) {
  return createJsonHandler('la administración', (request, response) => handleRequest(io, request, response), 'No disponible ahora.')
}
