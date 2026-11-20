import pg from 'pg'

const MAX_CONNECTIONS = 5

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    password_hash TEXT,
    google_sub TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS users_local_email ON users (email) WHERE password_hash IS NOT NULL;

  CREATE TABLE IF NOT EXISTS account_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    owner_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'study',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Las tablas creadas antes de que hubiera tipos de sala no tienen esta columna
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'study';
  -- El diseño en cubos (client/src/voxel/designs.ts); sin él, la sala usa el primero de su tipo
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS design TEXT;

  CREATE INDEX IF NOT EXISTS rooms_owner ON rooms (owner_id, last_used_at DESC);

  -- El nombre de usuario es único y no cambia; el apodo (name) se cambia a lo más una vez al mes
  ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS name_changed_at TIMESTAMPTZ;

  -- El perfil que ven los demás al hacer clic en ti
  ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS studies TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS institution TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;
  -- Quién ve tus estadísticas en tu perfil: 'public' (todos), 'friends' (solo amigos) o 'private' (solo tú)
  ALTER TABLE users ADD COLUMN IF NOT EXISTS stats_visibility TEXT NOT NULL DEFAULT 'public';

  -- Cómo se ve su personaje, del que sale su foto. Vacío: aún no lo eligió
  ALTER TABLE users ADD COLUMN IF NOT EXISTS character_look JSONB;

  -- El código que se comparte para que te agreguen como amigo
  ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_code TEXT UNIQUE;

  CREATE TABLE IF NOT EXISTS friend_requests (
    from_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    to_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (from_id, to_id)
  );

  CREATE INDEX IF NOT EXISTS friend_requests_to ON friend_requests (to_id);

  -- Los tramos de estudio que mide el servidor, de los que salen las estadísticas
  CREATE TABLE IF NOT EXISTS study_segments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    room_code TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL
  );

  CREATE INDEX IF NOT EXISTS study_segments_user ON study_segments (user_id, started_at);
  CREATE INDEX IF NOT EXISTS study_segments_room ON study_segments (room_code, started_at);

  -- Quién está en qué sala, en qué silla y con qué periodo de estudio: sirve para volver tras un reinicio
  CREATE TABLE IF NOT EXISTS active_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    room_code TEXT NOT NULL,
    seat_id INTEGER,
    x DOUBLE PRECISION NOT NULL DEFAULT 0,
    z DOUBLE PRECISION NOT NULL DEFAULT 0,
    activity TEXT NOT NULL,
    period TEXT NOT NULL,
    is_running BOOLEAN NOT NULL,
    period_id TEXT,
    pending_segments JSONB NOT NULL DEFAULT '[]',
    pending_ms INTEGER NOT NULL DEFAULT 0,
    studied_ms INTEGER NOT NULL DEFAULT 0,
    joined_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Cada amistad se guarda dos veces, una por dirección, y así buscar los amigos de alguien es simple
  -- Los espacios (un semestre, un proyecto) y sus apartados (ramos, partes)
  CREATE TABLE IF NOT EXISTS spaces (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS spaces_user ON spaces (user_id);
  -- El orden en que la persona dejó sus carpetas al arrastrarlas; las nuevas (sin posición) van primero
  ALTER TABLE spaces ADD COLUMN IF NOT EXISTS position INT;

  CREATE TABLE IF NOT EXISTS sections (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    space_id BIGINT NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    code TEXT,
    teacher TEXT,
    place TEXT,
    weekly_goal_minutes INTEGER,
    -- La escala de notas: la mínima, la máxima, la de aprobación y el porcentaje de exigencia
    grade_min NUMERIC(7, 2) NOT NULL,
    grade_max NUMERIC(7, 2) NOT NULL,
    grade_pass NUMERIC(7, 2) NOT NULL,
    exigencia INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS sections_user ON sections (user_id);

  -- La agenda: pruebas, tareas, trabajos, presentaciones y recordatorios de cada persona
  CREATE TABLE IF NOT EXISTS agenda_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    notes TEXT,
    due_date DATE NOT NULL,
    due_time TIME,
    remind_days INTEGER, -- cuántos días antes empieza el aviso; vacío es sin aviso
    done_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS agenda_items_user_date ON agenda_items (user_id, due_date);

  -- Cada cosa de la agenda puede ser de un apartado, y llevar su porcentaje y su nota
  ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS section_id BIGINT REFERENCES sections (id) ON DELETE SET NULL;
  ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS weight NUMERIC(5, 2);
  ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS grade NUMERIC(7, 2);
  CREATE INDEX IF NOT EXISTS agenda_items_section ON agenda_items (section_id);

  -- Lo que se lee de su programa: el horario, los requisitos de aprobación en palabras, y sus reglas
  ALTER TABLE sections ADD COLUMN IF NOT EXISTS schedule TEXT;
  ALTER TABLE sections ADD COLUMN IF NOT EXISTS requirements TEXT;
  ALTER TABLE sections ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '[]';

  -- Las clases de cada semana, para el horario: [{ day, start, end, kind, place }], day 1 es lunes
  ALTER TABLE sections ADD COLUMN IF NOT EXISTS classes JSONB NOT NULL DEFAULT '[]';

  -- El orden que cada persona les da a las cosas de un apartado, arrastrándolas; vacío es por fecha
  ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS position INTEGER;
  -- El orden de los apartados dentro de su carpeta, arrastrándolos; vacío es por creación
  ALTER TABLE sections ADD COLUMN IF NOT EXISTS position INTEGER;

  -- Una evaluación puede no tener fecha todavía: queda en su apartado, fuera del calendario
  ALTER TABLE agenda_items ALTER COLUMN due_date DROP NOT NULL;

  -- Los objetivos de estudio: cuántos minutos hasta qué día, de un ramo o en general.
  -- Cuenta lo estudiado desde que se crea; si el ramo se borra, el objetivo también.
  CREATE TABLE IF NOT EXISTS study_goals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    section_id BIGINT REFERENCES sections (id) ON DELETE CASCADE,
    minutes INTEGER NOT NULL,
    deadline DATE NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS study_goals_user ON study_goals (user_id, deadline);
  -- Archivado con la X: sale de la lista y queda en el historial
  ALTER TABLE study_goals ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

  -- Cada programa leído con IA, para el límite diario de cada persona
  CREATE TABLE IF NOT EXISTS syllabus_reads (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS syllabus_reads_user ON syllabus_reads (user_id, created_at);

  -- El tiempo de estudio también puede ser de un apartado
  ALTER TABLE study_segments ADD COLUMN IF NOT EXISTS section_id BIGINT REFERENCES sections (id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS friendships (
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    friend_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, friend_id)
  );

  -- Cuándo cerró StudyFocus por última vez: sus amigos ven "Activo hace 2 h"
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

  -- El chat entre amigos: cada mensaje, y cuándo lo leyó quien lo recibió
  CREATE TABLE IF NOT EXISTS messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    to_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS messages_pair ON messages (from_id, to_id, id);
  -- Administración (admin.ts). El rol: 'admin', 'moderator' o 'analyst'; el dueño se define en .env (OWNER_USERNAME)
  ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;
  -- Las sanciones vigentes: silenciado (no escribe en los chats), suspendido o bloqueado (no entra)
  ALTER TABLE users ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

  -- Los reportes de una persona a otra. Una persona tiene a lo más un reporte abierto contra otra
  CREATE TABLE IF NOT EXISTS reports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reporter_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reported_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'open', -- 'open', 'resolved' (se actuó) o 'dismissed' (sin acción)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ
  );
  CREATE UNIQUE INDEX IF NOT EXISTS reports_one_open ON reports (reporter_id, reported_id) WHERE status = 'open';
  CREATE INDEX IF NOT EXISTS reports_status ON reports (status, created_at);

  -- Todo lo que hace el equipo: sanciones, reportes cerrados y cambios de rol. Las advertencias se marcan al verlas
  CREATE TABLE IF NOT EXISTS admin_actions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id BIGINT REFERENCES users (id) ON DELETE SET NULL,
    target_id BIGINT REFERENCES users (id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- warning, mute, suspend, ban, lift, report_resolved, report_dismissed, role
    reason TEXT,
    until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    seen_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS admin_actions_target ON admin_actions (target_id, created_at);

  CREATE INDEX IF NOT EXISTS messages_unread ON messages (to_id, from_id) WHERE read_at IS NULL;
  -- Una invitación a una sala: el mensaje lleva su código y va sin texto
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS room_code TEXT;
`

// Sin esta variable no hay cuentas, y sin cuenta no se puede entrar a una sala
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: MAX_CONNECTIONS })
  : null

// Una conexión inactiva puede cerrarse desde el otro lado, y sin esto se cae todo el servidor
pool?.on('error', (error) => {
  console.error('Error en una conexión inactiva:', error.message)
})

let tablesReady: Promise<unknown> | null = null

export function hasDatabase() {
  return pool !== null
}

// Varias consultas que se guardan todas o ninguna
export async function withTransaction<T>(work: (run: typeof query) => Promise<T>) {
  await query('SELECT 1') // deja las tablas listas
  const client = await pool!.connect()
  try {
    await client.query('BEGIN')
    const result = await work(<Row extends pg.QueryResultRow>(text: string, values: unknown[] = []) => client.query<Row>(text, values))
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function query<Row extends pg.QueryResultRow>(text: string, values: unknown[] = []) {
  if (!pool) throw new Error('No hay base de datos configurada')

  // Se reintenta en la próxima consulta si falla: la base de datos puede no estar disponible al arrancar
  tablesReady ??= pool.query(SCHEMA).catch((error) => {
    tablesReady = null
    throw error
  })
  await tablesReady

  return pool.query<Row>(text, values)
}
