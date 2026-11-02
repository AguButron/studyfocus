import { getActivity, setActivity, type ActivityKind } from './activity'
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
const resetButton = document.querySelector<HTMLButtonElement>('#timer-reset')!
const studyInput = document.querySelector<HTMLInputElement>('#study-minutes')!
const breakInput = document.querySelector<HTMLInputElement>('#break-minutes')!
const studyValue = document.querySelector<HTMLSpanElement>('#study-value')!
const breakValue = document.querySelector<HTMLSpanElement>('#break-value')!
const minutesHint = document.querySelector<HTMLParagraphElement>('#minutes-hint')!
const standUpButton = document.querySelector<HTMLButtonElement>('#stand-up')!
const standUpHint = document.querySelector<HTMLParagraphElement>('#stand-up-hint')!
const activityButtons = document.querySelectorAll<HTMLButtonElement>('[data-activity]')
const miniPeriod = document.querySelector<HTMLSpanElement>('#mini-period')!
const miniTime = document.querySelector<HTMLSpanElement>('#mini-time')!

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

  studyInput.disabled = !isIdle
  breakInput.disabled = !isIdle
  minutesHint.hidden = isIdle
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

  resetButton.addEventListener('click', () => {
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

  renderActivity(getActivity())
  render()
  setInterval(render, UPDATE_INTERVAL)
}

export function setStudyScreenVisible(visible: boolean) {
  studyScreen.hidden = !visible
}
