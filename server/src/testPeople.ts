import type { Server } from 'socket.io'
import { CHARACTER_COLORS, describeCharacter, type Character } from './character.ts'
import { hasDatabase, query } from './database.ts'
import { setPresence } from './presence.ts'

// Cuentas y personas de prueba, solo para desarrollar. Se activan con --cuentas-de-prueba, que pasa
// `npm run dev`; en producción (`npm start`) nada de esto existe.
//
// Las cuentas se reconocen por un google_sub que empieza con "prueba:". Google entrega solo números
// en ese campo, así que nunca chocan con una cuenta real. No tienen contraseña ni Google detrás: en el
// sitio publicado nadie puede entrar con ellas, aunque la base de datos sea la misma.

export const isTestMode = process.argv.includes('--cuentas-de-prueba')

const TEST_SUB_PREFIX = 'prueba:'
export const TEST_USERNAME_PREFIX = 'prueba.'
const STATUS_INTERVAL = 20_000 // milisegundos: cada cuánto se revisa si alguien cambió de periodo
const STUDY_MINUTES = 25
const BREAK_MINUTES = 5
const HISTORY_DAYS = 7
const HISTORY_ROOM = 'PRUEBA' // el código con que se guarda su historial: no es una sala real
// Dónde están las sillas: lo mismo que arma client/src/room.ts. Si cambia allá, hay que cambiarlo aquí.
const TABLE_POSITIONS = [
  { x: -3, z: -2.5 },
  { x: 3, z: -2.5 },
  { x: -3, z: 2.5 },
  { x: 3, z: 2.5 },
]
const SEAT_OFFSET_X = 0.6
const SEAT_OFFSET_Z = 1.2

function seatPosition(seatId: number) {
  const table = TABLE_POSITIONS[Math.floor(seatId / 4)]
  const offsetX = seatId % 4 < 2 ? -SEAT_OFFSET_X : SEAT_OFFSET_X
  const offsetZ = seatId % 2 === 0 ? -SEAT_OFFSET_Z : SEAT_OFFSET_Z
  return { x: table.x + offsetX, z: table.z + offsetZ }
}

interface TestPersonInfo {
  key: string // va en el google_sub y en el nombre de usuario
  name: string
  color: string
  bio: string
  studies: string
  // Las que están conectadas: en qué sala, en qué silla y qué hacen. Sin esto, es para entrar con ella.
  bot?: { room: 'study' | 'solo'; seatId: number; activity: string; offsetMinutes: number }
  dailyMinutes: number // cuánto estudió, en promedio, cada uno de los últimos días
}

const PEOPLE: TestPersonInfo[] = [
  { key: 'ana', name: 'Ana', color: CHARACTER_COLORS[0], bio: 'Cuenta de prueba.', studies: 'Ingeniería', dailyMinutes: 0 },
  { key: 'benja', name: 'Benja', color: CHARACTER_COLORS[2], bio: 'Cuenta de prueba.', studies: 'Medicina', dailyMinutes: 0 },
  { key: 'cata', name: 'Cata', color: CHARACTER_COLORS[5], bio: 'Cuenta de prueba.', studies: 'Derecho', dailyMinutes: 0 },
  {
    key: 'diego', name: 'Diego', color: CHARACTER_COLORS[4], bio: 'Persona de prueba: siempre está conectada.',
    studies: 'Arquitectura', dailyMinutes: 150,
    bot: { room: 'study', seatId: 0, activity: 'computer', offsetMinutes: 0 },
  },
  {
    key: 'ema', name: 'Ema', color: CHARACTER_COLORS[1], bio: 'Persona de prueba: siempre está conectada.',
    studies: 'Psicología', dailyMinutes: 90,
    bot: { room: 'study', seatId: 6, activity: 'reading', offsetMinutes: 12 },
  },
  {
    key: 'fran', name: 'Fran', color: CHARACTER_COLORS[6], bio: 'Persona de prueba: siempre está conectada.',
    studies: 'Pedagogía', dailyMinutes: 45,
    bot: { room: 'study', seatId: 9, activity: 'writing', offsetMinutes: 27 },
  },
  {
    key: 'gabi', name: 'Gabi', color: CHARACTER_COLORS[3], bio: 'Persona de prueba: estudia sola.',
    studies: 'Contabilidad', dailyMinutes: 200,
    bot: { room: 'solo', seatId: 0, activity: 'computer', offsetMinutes: 5 },
  },
]

export interface TestAccount {
  username: string
  name: string
  character: Character
}

// Lo que la página muestra en el apartado de cuentas de prueba: solo las que no están conectadas solas
let loginAccounts: TestAccount[] = []
const accountIds = new Map<string, string>() // nombre de usuario → id de la cuenta

export function listTestAccounts() {
  return isTestMode ? loginAccounts : null
}

export function findTestAccountId(username: unknown) {
  if (!isTestMode || typeof username !== 'string') return null
  return loginAccounts.some((account) => account.username === username) ? (accountIds.get(username) ?? null) : null
}

// Crea las cuentas si no existen, y deja a todas como amigas entre ellas
async function createAccounts() {
  for (const person of PEOPLE) {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (name, google_sub, bio, studies, character_look) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (google_sub) DO UPDATE SET name = EXCLUDED.name, bio = EXCLUDED.bio,
         studies = EXCLUDED.studies, character_look = EXCLUDED.character_look
       RETURNING id`,
      [person.name, TEST_SUB_PREFIX + person.key, person.bio, person.studies, JSON.stringify({ color: person.color })],
    )
    const id = rows[0].id
    const username = TEST_USERNAME_PREFIX + person.key

    // Si una cuenta real ya tiene ese nombre de usuario, esta queda sin él y no aparece para entrar
    const { rows: named } = await query<{ username: string | null }>(
      `UPDATE users SET username = coalesce(username, $1) WHERE id = $2
         AND NOT EXISTS (SELECT 1 FROM users WHERE username = $1 AND id <> $2)
       RETURNING username`,
      [username, id],
    )
    if (named[0]?.username === username) accountIds.set(username, id)
  }

  const ids = [...accountIds.values()]
  await query(
    `INSERT INTO friendships (user_id, friend_id)
     SELECT a, b FROM unnest($1::bigint[]) a, unnest($1::bigint[]) b WHERE a <> b
     ON CONFLICT DO NOTHING`,
    [ids],
  )

  loginAccounts = PEOPLE.filter((person) => !person.bot && accountIds.has(TEST_USERNAME_PREFIX + person.key)).map(
    (person) => ({
      username: TEST_USERNAME_PREFIX + person.key,
      name: person.name,
      character: describeCharacter({ color: person.color }, accountIds.get(TEST_USERNAME_PREFIX + person.key)!),
    }),
  )
}

// Un historial de los últimos días para las conectadas, así hay con quién comparar. Solo la primera vez.
async function createHistory() {
  for (const person of PEOPLE) {
    const id = accountIds.get(TEST_USERNAME_PREFIX + person.key)
    if (!id || person.dailyMinutes === 0) continue

    const { rows } = await query<{ count: number }>('SELECT count(*)::int AS count FROM study_segments WHERE user_id = $1', [id])
    if (rows[0].count > 0) continue

    for (let day = 1; day <= HISTORY_DAYS; day++) {
      // Varía de un día a otro, siempre igual para la misma persona
      const minutes = Math.round(person.dailyMinutes * (0.5 + ((day * 37 + person.key.length * 11) % 100) / 100))
      await query(
        `INSERT INTO study_segments (user_id, room_code, started_at, ended_at)
         VALUES ($1, $2, date_trunc('day', now()) - make_interval(days => $3) + interval '15 hours',
           date_trunc('day', now()) - make_interval(days => $3) + interval '15 hours' + make_interval(mins => $4))`,
        [id, HISTORY_ROOM, day, minutes],
      )
    }
  }
}

// Lo que necesita de las salas del servidor
interface RoomsAccess {
  io: Server
  addRoom(code: string, kind: string, players: BotPlayer[]): void
  createCode(ownerId: string, kind: string): Promise<string>
}

export interface BotPlayer {
  id: string
  nickname: string
  username: string | null
  character: Character
  seatId: number | null
  x: number
  z: number
  activity: string
  period: string
  isRunning: boolean
}

// En qué periodo va cada una: estudio y descanso, siempre corriendo, desfasadas entre sí
function periodFor(offsetMinutes: number) {
  const cycle = STUDY_MINUTES + BREAK_MINUTES
  const minute = (Date.now() / 60_000 + offsetMinutes) % cycle
  return minute < STUDY_MINUTES ? 'study' : 'break'
}

async function connectBots({ io, addRoom, createCode }: RoomsAccess) {
  const bots = PEOPLE.filter((person) => person.bot && accountIds.has(TEST_USERNAME_PREFIX + person.key))
  const moving: { player: BotPlayer; offsetMinutes: number; code: string }[] = []

  for (const kind of ['study', 'solo'] as const) {
    const inRoom = bots.filter((person) => person.bot!.room === kind)
    if (inRoom.length === 0) continue

    const ownerId = accountIds.get(TEST_USERNAME_PREFIX + inRoom[0].key)!
    const code = await createCode(ownerId, kind)
    const players = inRoom.map((person) => {
      const username = TEST_USERNAME_PREFIX + person.key
      const player: BotPlayer = {
        id: `prueba-${person.key}`,
        nickname: person.name,
        username,
        character: { color: person.color },
        seatId: person.bot!.seatId,
        ...seatPosition(person.bot!.seatId),
        activity: person.bot!.activity,
        period: periodFor(person.bot!.offsetMinutes),
        isRunning: true,
      }
      moving.push({ player, offsetMinutes: person.bot!.offsetMinutes, code })
      setPresence(accountIds.get(username)!, { code, kind, player })
      return player
    })
    addRoom(code, kind, players)
    if (kind === 'study') console.log(`Personas de prueba estudiando en la sala ${code}`)
  }

  setInterval(() => {
    for (const { player, offsetMinutes, code } of moving) {
      const period = periodFor(offsetMinutes)
      if (period === player.period) continue
      player.period = period
      io.to(code).emit('player:status', player)
    }
  }, STATUS_INTERVAL)
}

export async function startTestPeople(access: RoomsAccess) {
  if (!isTestMode) return
  if (!hasDatabase()) {
    console.log('Sin DATABASE_URL no hay cuentas de prueba.')
    return
  }

  try {
    await createAccounts()
    await createHistory()
    await connectBots(access)
    console.log(`Cuentas de prueba listas: ${loginAccounts.map((account) => account.username).join(', ')}`)
  } catch (error) {
    console.error('No se pudieron preparar las cuentas de prueba:', error)
  }
}
