import './style.css'
import { getActivity } from './choices'
import { showHome } from './home'
import { sendStatus } from './network'
import { playPeriodSound } from './sound'
import { getTimer, onPeriodChange, updateTimer } from './timer'
import { getStudySection, setStudyScreenVisible, setUpTimerPanel } from './timerPanel'

// El arranque de la página. La sala 3D (Three.js) no se carga aquí: se descarga al entrar a una sala
// (roomScene.ts), así que el menú y estudiar solo cargan más rápido y no usan memoria de video.

const STATUS_INTERVAL = 500 // milisegundos

let statusTimer = 0
let room: typeof import('./roomScene') | null = null

function shareStatus() {
  updateTimer()
  const { period, isRunning, periodId } = getTimer()
  sendStatus({ activity: getActivity(), period, isRunning, periodId, sectionId: getStudySection() })
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

// Al volver al menú sin recargar: deja de mandar el estado y, si había sala 3D, la libera
function stopRoom() {
  clearInterval(statusTimer)
  room?.stopRoom()
  setStudyScreenVisible(false)
}

showHome(
  async (nickname, character, resumed, isSolo) => {
    onPeriodChange(playPeriodSound)
    if (isSolo) {
      // Estudiar solo: solo el temporizador, sin la sala 3D. La música está siempre, también en el menú
      setUpTimerPanel(() => {})
      setStudyScreenVisible(true)
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
