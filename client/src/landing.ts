// La portada: qué es StudyFocus, para quien llega por primera vez o hace clic en el logo
import { drawRoomPlan, type SeatState } from './roomPlan'

interface LandingActions {
  start(): void // crear una cuenta, o volver al menú con la sesión iniciada
  logIn(): void
}

// Unas sillas ocupadas, para que se entienda la idea de un vistazo
const EXAMPLE_SEATS = new Map<number, SeatState>([
  [0, 'study'],
  [1, 'study'],
  [3, 'break'],
  [5, 'study'],
  [10, 'study'],
  [12, 'break'],
])

const landing = document.querySelector<HTMLDivElement>('#landing')!
const planArt = document.querySelector<HTMLDivElement>('#landing-plan-art')!
const topAction = document.querySelector<HTMLButtonElement>('#landing-top-action')!
const startButton = document.querySelector<HTMLButtonElement>('#landing-start')!
const loginButton = document.querySelector<HTMLButtonElement>('#landing-login')!
const endAction = document.querySelector<HTMLButtonElement>('#landing-end-action')!

let isSignedIn = false

export function setUpLanding(actions: LandingActions) {
  planArt.innerHTML = drawRoomPlan(EXAMPLE_SEATS)

  startButton.addEventListener('click', () => actions.start())
  endAction.addEventListener('click', () => actions.start())
  loginButton.addEventListener('click', () => actions.logIn())
  topAction.addEventListener('click', () => (isSignedIn ? actions.start() : actions.logIn()))
}

export function showLanding(signedIn: boolean) {
  isSignedIn = signedIn
  const enterText = signedIn ? 'Ir a las salas' : 'Crear una cuenta'
  startButton.textContent = enterText
  endAction.textContent = enterText
  topAction.textContent = signedIn ? 'Ir a las salas' : 'Iniciar sesión'
  loginButton.hidden = signedIn

  landing.hidden = false
  landing.scrollIntoView()
}

export function hideLanding() {
  landing.hidden = true
}
