import { getActivity, setActivity, type ActivityKind } from './activity'
import { chooseCamera, chooseNextCamera, getChosenCamera, type CameraKind } from './cameraView'
import { onKeyPress } from './input'
import {
  BREAK_MINUTES,
  getTimer,
  isStudyRunning,
  isTimerIdle,
  resetTimer,
  setMinutes,
  STUDY_MINUTES,
  toggleTimer,
  updateTimer,
} from './timer'

const UPDATE_INTERVAL = 250 // milisegundos

const studyScreen = document.querySelector<HTMLElement>('#study')!
const studyPanel = document.querySelector<HTMLDivElement>('#study-panel')!
const periodText = document.querySelector<HTMLSpanElement>('#timer-period')!
const timeText = document.querySelector<HTMLDivElement>('#timer-time')!
const progressBar = document.querySelector<HTMLDivElement>('#timer-progress')!
const toggleButton = document.querySelector<HTMLButtonElement>('#timer-toggle')!
const timerActions = document.querySelector<HTMLDivElement>('#timer-actions')!
const abandonButton = document.querySelector<HTMLButtonElement>('#timer-abandon')!
const abandonConfirm = document.querySelector<HTMLDivElement>('#abandon-confirm')!
const abandonYesButton = document.querySelector<HTMLButtonElement>('#abandon-yes')!
const abandonNoButton = document.querySelector<HTMLButtonElement>('#abandon-no')!
const studyInput = document.querySelector<HTMLInputElement>('#study-minutes')!
const breakInput = document.querySelector<HTMLInputElement>('#break-minutes')!
const studyValue = document.querySelector<HTMLSpanElement>('#study-value')!
const breakValue = document.querySelector<HTMLSpanElement>('#break-value')!
const standUpButton = document.querySelector<HTMLButtonElement>('#stand-up')!
const standUpHint = document.querySelector<HTMLParagraphElement>('#stand-up-hint')!
const activityButtons = document.querySelectorAll<HTMLButtonElement>('[data-activity]')
const activitySection = document.querySelector<HTMLElement>('#activity-section')!
const cameraPanel = document.querySelector<HTMLElement>('#camera-panel')!
const cameraButtons = document.querySelectorAll<HTMLButtonElement>('[data-camera]')
const miniPeriod = document.querySelector<HTMLSpanElement>('#mini-period')!
const miniTime = document.querySelector<HTMLSpanElement>('#mini-time')!

let isConfirmingAbandon = false

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function setUpSlider(input: HTMLInputElement, limits: { min: number; max: number; step: number }, minutes: number) {
  input.min = String(limits.min)
  input.max = String(limits.max)
  input.step = String(limits.step)
  input.value = String(minutes)
}

function render() {
  updateTimer()

  const timer = getTimer()
  const periodName = timer.period === 'study' ? 'Estudio' : 'Descanso'
  const time = formatTime(timer.remainingMs)
  const isIdle = isTimerIdle()

  periodText.textContent = periodName
  timeText.textContent = time
  miniPeriod.textContent = periodName
  miniTime.textContent = time
  studyPanel.dataset.period = timer.period
  progressBar.style.transform = `scaleX(${1 - timer.remainingMs / timer.durationMs})`

  toggleButton.textContent = timer.isRunning ? 'Pausar' : isIdle ? 'Iniciar' : 'Reanudar'

  const isLocked = isStudyRunning()
  standUpButton.disabled = isLocked
  standUpHint.hidden = !isLocked
  cameraPanel.hidden = isIdle
  abandonButton.hidden = isIdle
  timerActions.hidden = isConfirmingAbandon
  abandonConfirm.hidden = !isConfirmingAbandon
  activitySection.hidden = timer.isRunning // para no distraer: solo se cambia detenido

  studyInput.disabled = !isIdle
  breakInput.disabled = !isIdle
  studyInput.value = String(timer.studyMinutes)
  breakInput.value = String(timer.breakMinutes)
  studyValue.textContent = `${timer.studyMinutes} min`
  breakValue.textContent = `${timer.breakMinutes} min`
}

function applyMinutes() {
  setMinutes(Number(studyInput.value), Number(breakInput.value))
  render()
}

function renderActivity(activity: ActivityKind) {
  for (const button of activityButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.activity === activity))
  }
}

function renderCamera() {
  const camera = getChosenCamera()
  for (const button of cameraButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.camera === camera))
  }
}

export function setUpTimerPanel(onStandUp: () => void) {
  const timer = getTimer()
  setUpSlider(studyInput, STUDY_MINUTES, timer.studyMinutes)
  setUpSlider(breakInput, BREAK_MINUTES, timer.breakMinutes)

  studyInput.addEventListener('input', applyMinutes)
  breakInput.addEventListener('input', applyMinutes)

  toggleButton.addEventListener('click', () => {
    toggleTimer()
    render()
  })

  abandonButton.addEventListener('click', () => {
    isConfirmingAbandon = true
    render()
  })

  abandonNoButton.addEventListener('click', () => {
    isConfirmingAbandon = false
    render()
  })

  abandonYesButton.addEventListener('click', () => {
    isConfirmingAbandon = false
    resetTimer()
    render()
  })

  standUpButton.addEventListener('click', onStandUp)

  for (const button of activityButtons) {
    button.addEventListener('click', () => {
      const activity = button.dataset.activity as ActivityKind
      setActivity(activity)
      renderActivity(activity)
    })
  }

  for (const button of cameraButtons) {
    button.addEventListener('click', () => {
      chooseCamera(button.dataset.camera as CameraKind)
      renderCamera()
    })
  }

  onKeyPress('KeyC', () => {
    if (studyScreen.hidden || isTimerIdle()) return
    chooseNextCamera()
    renderCamera()
  })

  renderActivity(getActivity())
  renderCamera()
  render()
  setInterval(render, UPDATE_INTERVAL)
}

export function setStudyScreenVisible(visible: boolean) {
  studyScreen.hidden = !visible
}

export function setStudyPanelCompact(compact: boolean) {
  studyPanel.classList.toggle('compact', compact)
}
