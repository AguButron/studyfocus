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

  CREATE INDEX IF NOT EXISTS rooms_owner ON rooms (owner_id, last_used_at DESC);

  -- El nombre de usuario es único y no cambia; el apodo (name) se cambia a lo más una vez al mes
  ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS name_changed_at TIMESTAMPTZ;

  -- El perfil que ven los demás al hacer clic en ti
  ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS studies TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS institution TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;

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
  CREATE TABLE IF NOT EXISTS friendships (
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    friend_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, friend_id)
  );
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
