// Inicio: lo primero que se ve con la sesión iniciada. El saludo, tu estudio y lo que viene esta semana.
import { onAgendaChange, setUpAgendaDialog } from './agendaDialog'
import { describeToday, refreshCalendar, setUpCalendar } from './calendar'
import { formatDuration, loadStats } from './stats'
import { refreshUpcoming, setUpUpcoming } from './upcoming'

const greeting = document.querySelector<HTMLHeadingElement>('#home-title')!
const dateText = document.querySelector<HTMLParagraphElement>('#home-date')!
const todayText = document.querySelector<HTMLElement>('#home-today')!
const streakText = document.querySelector<HTMLElement>('#home-streak')!
const weekText = document.querySelector<HTMLElement>('#home-week')!

let request = 0 // descarta una respuesta vieja si se pidió de nuevo

// Un cambio en la agenda se ve al tiro en Inicio y en el calendario
function refreshAgenda() {
  refreshUpcoming()
  refreshCalendar()
}

export function setUpHomePanel() {
  setUpAgendaDialog()
  onAgendaChange(refreshAgenda)
  setUpUpcoming(refreshAgenda)
  setUpCalendar()
}

export async function refreshHomePanel(name: string) {
  greeting.textContent = `Hola, ${name}`
  dateText.textContent = describeToday()
  refreshUpcoming()

  const current = ++request
  const stats = await loadStats()
  if (current !== request || !stats) return

  todayText.textContent = formatDuration(stats.today)
  weekText.textContent = formatDuration(stats.week)
  streakText.textContent = stats.streak === 1 ? '1 día' : `${stats.streak} días`
}
