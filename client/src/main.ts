import './style.css'
import type { Character } from './character'
import { getActivity } from './choices'
import { showHome } from './home'
import { sendStatus } from './network'
import { playPeriodSound } from './sound'
import { getTimer, isTimerIdle, onPeriodChange, updateTimer } from './timer'
import { getStudySection, setStudyScreenVisible, setUpTimerPanel } from './timerPanel'

// El arranque de la página. La sala 3D (Three.js) no se carga aquí: se descarga al entrar a una sala
// (roomScene.ts), así que el menú y estudiar solo cargan más rápido y no usan memoria de video.

const STATUS_INTERVAL = 500 // milisegundos

let statusTimer = 0
let room: typeof import('./roomScene') | null = null
let desk: typeof import('./deskScene') | null = null

function shareStatus() {
  updateTimer()
  const { period, isRunning, periodId, studyMinutes, breakMinutes, remainingMs } = getTimer()
  sendStatus({
    activity: getActivity(),
    period,
    isRunning,
    isStarted: !isTimerIdle(),
    periodId,
    sectionId: getStudySection(),
    studyMinutes,
    breakMinutes,
    remainingMs: Math.round(remainingMs),
  })
}

// Descarga la sala antes de entrar: el servidor manda quiénes están adentro justo al entrar,
// y quien los dibuja tiene que estar escuchando. Responde false si no se pudo descargar
async function prepareRoom() {
  try {
    room ??= await import('./roomScene')
    return true
  } catch (error) {
    console.error('No se pudo cargar la sala:', error)
    return false
  }
}

// Estudiar solo: el escritorio también es Three.js, así que se descarga recién al entrar
async function startDesk(character: Character) {
  try {
    desk ??= await import('./deskScene')
    desk.startDesk(character)
    return true
  } catch (error) {
    console.error('No se pudo cargar el escritorio:', error)
    return false
  }
}

// Al volver al menú sin recargar: deja de mandar el estado y, si había sala 3D, la libera
function stopRoom() {
  clearInterval(statusTimer)
  room?.stopRoom()
  desk?.stopDesk()
  setStudyScreenVisible(false)
}

showHome(
  async (nickname, character, resumed, isSolo) => {
    onPeriodChange(playPeriodSound)
    if (isSolo) {
      // Estudiar solo: tu escritorio en 3D, ya sentado. Si no se puede descargar, queda la pantalla simple
      if (!(await startDesk(character))) {
        document.documentElement.dataset.mode = 'simple'
        setUpTimerPanel(() => {})
        setStudyScreenVisible(true)
      }
    } else {
      if (!(await prepareRoom())) {
        window.location.reload() // sin la sala no se puede seguir: al recargar se vuelve a ella
        return
      }
      room!.startRoom(nickname, character, resumed)
    }
    shareStatus()
    // Fuera del bucle de dibujo, que se detiene al estudiar con la pestaña oculta
    statusTimer = window.setInterval(shareStatus, STATUS_INTERVAL)
  },
  stopRoom,
  prepareRoom,
)
