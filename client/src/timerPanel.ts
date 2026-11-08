import { getActivity, setActivity, type ActivityKind } from './activity'
import { chooseCamera, chooseNextCamera, getChosenCamera, type CameraKind } from './cameraView'
import { onKeyPress } from './input'
import { describeKind, ensureSpaces, findSection, getSpaces } from './spaces'
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
const MAX_CELLS = 30 // en periodos más largos, cada celda junta varios minutos
const MS_PER_MINUTE = 60_000

const studyScreen = document.querySelector<HTMLElement>('#study')!
const studyPanel = document.querySelector<HTMLDivElement>('#study-panel')!
const periodText = document.querySelector<HTMLSpanElement>('#timer-period')!
const timeText = document.querySelector<HTMLDivElement>('#timer-time')!
const progressCells = document.querySelector<HTMLDivElement>('#timer-progress')!
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
const sectionField = document.querySelector<HTMLDivElement>('#study-section-field')!
const sectionSelect = document.querySelector<HTMLSelectElement>('#study-section')!
const SECTION_KEY = 'studyfocus.section'

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

// La parte elegida del riel se pinta con el color del periodo
function paintSlider(input: HTMLInputElement) {
  const min = Number(input.min)
  const share = (Number(input.value) - min) / (Number(input.max) - min)
  input.style.setProperty('--value', `${share * 100}%`)
}

// Una celda por minuto: las pasadas se llenan y la actual se va llenando de a poco
function renderCells(durationMs: number, remainingMs: number) {
  const minutes = Math.max(1, Math.round(durationMs / MS_PER_MINUTE))
  const count = Math.ceil(minutes / Math.ceil(minutes / MAX_CELLS))

  if (progressCells.children.length !== count) {
    progressCells.style.setProperty('--cells', String(count))
    progressCells.replaceChildren(...Array.from({ length: count }, () => document.createElement('i')))
  }

  const elapsed = Math.min(1, Math.max(0, 1 - remainingMs / durationMs)) * count
  const done = Math.floor(elapsed)
  Array.from(progressCells.children as HTMLCollectionOf<HTMLElement>).forEach((cell, index) => {
    const isNow = index === done && elapsed > done
    cell.toggleAttribute('data-on', index < done)
    cell.toggleAttribute('data-now', isNow)
    cell.style.setProperty('--fill', isNow ? `${(elapsed - done) * 100}%` : '')
  })

  progressCells.setAttribute('aria-valuemin', '0')
  progressCells.setAttribute('aria-valuemax', String(minutes))
  progressCells.setAttribute('aria-valuenow', String(Math.floor((durationMs - remainingMs) / MS_PER_MINUTE)))
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
  miniPeriod.dataset.period = timer.period
  miniTime.textContent = time
  studyPanel.dataset.period = timer.period
  renderCells(timer.durationMs, timer.remainingMs)

  toggleButton.textContent = timer.isRunning ? 'Pausar' : isIdle ? 'Iniciar' : 'Reanudar'

  const isLocked = isStudyRunning()
  // Mientras corre el estudio no se cambia: el periodo se anota completo con un solo apartado
  sectionSelect.disabled = isLocked
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
  paintSlider(studyInput)
  paintSlider(breakInput)
  studyValue.textContent = `${timer.studyMinutes} min`
  breakValue.textContent = `${timer.breakMinutes} min`
}

// Lo que se estudia en este periodo: un ramo, una parte de un proyecto… Se recuerda para la próxima vez.
export function getStudySection() {
  return findSection(sectionSelect.value || null)?.section.id ?? null
}

async function fillStudySections() {
  await ensureSpaces()
  let saved: string | null = null
  try {
    saved = localStorage.getItem(SECTION_KEY)
  } catch {
    // Sin almacenamiento parte sin apartado
  }

  const groups = getSpaces()
    .filter((space) => !space.archived && space.sections.length > 0)
    .map((space) => {
      const group = document.createElement('optgroup')
      group.label = `${space.name} · ${describeKind(space.kind).sections}`
      group.append(...space.sections.map((section) => new Option(section.name, section.id)))
      return group
    })
  sectionSelect.replaceChildren(new Option('Nada en particular', ''), ...groups)
  sectionSelect.value = findSection(saved) ? saved! : ''
  sectionField.hidden = groups.length === 0
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

  fillStudySections()
  sectionSelect.addEventListener('change', () => {
    try {
      localStorage.setItem(SECTION_KEY, sectionSelect.value)
    } catch {
      // Sin almacenamiento, el apartado elegido dura hasta recargar
    }
  })

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
