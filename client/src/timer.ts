const STATE_KEY = 'studyfocus.timer'
const MINUTES_KEY = 'studyfocus.minutes'
const DEFAULT_STUDY_MINUTES = 25
const DEFAULT_BREAK_MINUTES = 5
const MS_PER_MINUTE = 60_000

export const STUDY_MINUTES = { min: 5, max: 120, step: 5 }
export const BREAK_MINUTES = { min: 1, max: 30, step: 1 }

export type Period = 'study' | 'break'

interface TimerState {
  studyMinutes: number
  breakMinutes: number
  period: Period
  isRunning: boolean
  endsAt: number // cuándo termina el periodo, solo si está corriendo
  remainingMs: number // cuánto falta, solo si está en pausa
  periodId: string // cambia con cada periodo nuevo: el servidor cuenta el estudio solo si el periodo termina
}

function isValidMinutes(value: unknown, limits: { min: number; max: number }) {
  return Number.isInteger(value) && (value as number) >= limits.min && (value as number) <= limits.max
}

// Los minutos elegidos valen para todo el navegador y para la próxima vez
function loadMinutes() {
  const defaults = { studyMinutes: DEFAULT_STUDY_MINUTES, breakMinutes: DEFAULT_BREAK_MINUTES }

  try {
    const saved = JSON.parse(localStorage.getItem(MINUTES_KEY) ?? 'null')
    return isValidMinutes(saved?.studyMinutes, STUDY_MINUTES) && isValidMinutes(saved?.breakMinutes, BREAK_MINUTES)
      ? { studyMinutes: saved.studyMinutes as number, breakMinutes: saved.breakMinutes as number }
      : defaults
  } catch {
    return defaults
  }
}

function createDefaultState(): TimerState {
  const { studyMinutes, breakMinutes } = loadMinutes()
  return {
    studyMinutes,
    breakMinutes,
    period: 'study',
    isRunning: false,
    endsAt: 0,
    remainingMs: studyMinutes * MS_PER_MINUTE,
    periodId: crypto.randomUUID(),
  }
}

function isValidState(value: unknown): value is TimerState {
  if (typeof value !== 'object' || value === null) return false

  const state = value as Partial<TimerState>
  return (
    isValidMinutes(state.studyMinutes, STUDY_MINUTES) &&
    isValidMinutes(state.breakMinutes, BREAK_MINUTES) &&
    (state.period === 'study' || state.period === 'break') &&
    typeof state.isRunning === 'boolean' &&
    Number.isFinite(state.endsAt) &&
    Number.isFinite(state.remainingMs)
  )
}

// La sesión en curso es de cada pestaña y sobrevive a una recarga: dos pestañas son dos personas
function loadState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STATE_KEY) ?? 'null')
    if (!isValidState(saved)) return createDefaultState()
    // Un temporizador guardado antes de que existiera el identificador del periodo
    return { ...saved, periodId: typeof saved.periodId === 'string' ? saved.periodId : crypto.randomUUID() }
  } catch {
    return createDefaultState()
  }
}

function saveState() {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {
    // Sin almacenamiento el temporizador funciona igual, pero no sobrevive a una recarga
  }
}

const state = loadState()
// Varios a la vez: el sonido del cambio de periodo y las barras de los objetivos, por ejemplo
const periodListeners: ((period: Period) => void)[] = []

export function onPeriodChange(listener: (period: Period) => void) {
  periodListeners.push(listener)
}

function periodDuration(period: Period) {
  const minutes = period === 'study' ? state.studyMinutes : state.breakMinutes
  return minutes * MS_PER_MINUTE
}

export function updateTimer() {
  if (!state.isRunning) return

  const now = Date.now()
  let changed = false

  // Al terminar el estudio parte solo el descanso. Al terminar el descanso se detiene: el siguiente
  // periodo hay que iniciarlo a mano, así nadie suma horas dejando la página abierta sin estar.
  // Con un while también se pone al día lo que pasó con la página cerrada.
  while (state.isRunning && now >= state.endsAt) {
    if (state.period === 'study') {
      state.period = 'break'
      state.endsAt += periodDuration('break')
    } else {
      state.period = 'study'
      state.isRunning = false
      state.remainingMs = periodDuration('study')
    }
    state.periodId = crypto.randomUUID()
    changed = true
  }

  if (changed) {
    saveState()
    for (const listener of periodListeners) listener(state.period)
  }
}

export function getTimer() {
  return {
    period: state.period,
    isRunning: state.isRunning,
    remainingMs: state.isRunning ? state.endsAt - Date.now() : state.remainingMs,
    durationMs: periodDuration(state.period),
    studyMinutes: state.studyMinutes,
    breakMinutes: state.breakMinutes,
    periodId: state.periodId,
  }
}

// Sin empezar: detenido, en estudio y con el periodo completo por delante
export function isTimerIdle() {
  return !state.isRunning && state.period === 'study' && state.remainingMs === periodDuration('study')
}

// Estudiando ahora mismo: en pausa o en descanso no cuenta
export function isStudyRunning() {
  updateTimer()
  return state.isRunning && state.period === 'study'
}

// El temporizador que el servidor manda al cambiar la sesión desde otra ventana: se sigue desde ahí
export interface HandedTimer {
  studyMinutes: number
  breakMinutes: number
  period: Period
  isRunning: boolean
  remainingMs: number
  periodId: string
}

export function adoptTimer(handed: HandedTimer) {
  const adopted = { ...handed, endsAt: handed.isRunning ? Date.now() + handed.remainingMs : 0 }
  if (!isValidState(adopted) || typeof handed.periodId !== 'string') return
  state.studyMinutes = adopted.studyMinutes
  state.breakMinutes = adopted.breakMinutes
  state.period = adopted.period
  state.isRunning = adopted.isRunning
  state.endsAt = adopted.endsAt
  state.remainingMs = Math.min(adopted.remainingMs, periodDuration(adopted.period))
  state.periodId = adopted.periodId
  saveState()
}

export function toggleTimer() {
  if (state.isRunning) {
    state.remainingMs = state.endsAt - Date.now()
  } else {
    state.endsAt = Date.now() + state.remainingMs
  }

  state.isRunning = !state.isRunning
  saveState()
}

// Abandonar empieza un periodo nuevo: lo estudiado en el anterior no cuenta
export function resetTimer() {
  state.period = 'study'
  state.isRunning = false
  state.remainingMs = periodDuration('study')
  state.periodId = crypto.randomUUID()
  saveState()
}

export function setMinutes(studyMinutes: number, breakMinutes: number) {
  if (!isTimerIdle()) return

  state.studyMinutes = studyMinutes
  state.breakMinutes = breakMinutes
  resetTimer()

  try {
    localStorage.setItem(MINUTES_KEY, JSON.stringify({ studyMinutes, breakMinutes }))
  } catch {
    // Sin almacenamiento, los minutos elegidos solo duran hasta cerrar la pestaña
  }
}

updateTimer()
