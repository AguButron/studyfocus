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
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS rooms_owner ON rooms (owner_id, last_used_at DESC);
`

// Sin esta variable no hay cuentas, pero se puede estudiar igual: las salas viven en la memoria
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
