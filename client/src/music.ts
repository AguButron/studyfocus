// La música de cada persona, abajo a la derecha de la sala. Nadie más la escucha.
import { setLofiVolume, startLofi, stopLofi } from './lofi'
import { createYouTubePlayer, parseYouTubeLink } from './youtube'

type MusicMode = 'off' | 'studyfocus' | 'youtube'

interface MusicSettings {
  mode: MusicMode
  volume: number // de 0 a 1, solo para la música de StudyFocus: YouTube tiene su propio control
  youtubeUrl: string
}

const SETTINGS_KEY = 'studyfocus.music'
const DEFAULT_YOUTUBE_URL = 'https://www.youtube.com/watch?v=h8UpC5JbMU0&t=4218s'
const DEFAULT_SETTINGS: MusicSettings = { mode: 'off', volume: 0.5, youtubeUrl: DEFAULT_YOUTUBE_URL }
const LABELS: Record<MusicMode, string> = {
  off: 'Música',
  studyfocus: 'Lofi de StudyFocus',
  youtube: 'YouTube',
}

const musicSection = document.querySelector<HTMLElement>('#music')!
const toggleButton = document.querySelector<HTMLButtonElement>('#music-toggle')!
const toggleLabel = document.querySelector<HTMLSpanElement>('#music-label')!
const closeButton = document.querySelector<HTMLButtonElement>('#music-close')!
const panel = document.querySelector<HTMLDivElement>('#music-panel')!
const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-music]')
const volumeField = document.querySelector<HTMLLabelElement>('#music-volume-field')!
const volumeInput = document.querySelector<HTMLInputElement>('#music-volume')!
const volumeText = document.querySelector<HTMLSpanElement>('#music-volume-value')!
const youtubeForm = document.querySelector<HTMLFormElement>('#music-youtube-form')!
const youtubeInput = document.querySelector<HTMLInputElement>('#music-youtube-url')!
const errorText = document.querySelector<HTMLParagraphElement>('#music-error')!
const videoBox = document.querySelector<HTMLDivElement>('#music-video')!

let settings = loadSettings()

function loadSettings(): MusicSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    return {
      mode: ['off', 'studyfocus', 'youtube'].includes(saved?.mode) ? saved.mode : DEFAULT_SETTINGS.mode,
      volume: typeof saved?.volume === 'number' && saved.volume >= 0 && saved.volume <= 1 ? saved.volume : DEFAULT_SETTINGS.volume,
      youtubeUrl: typeof saved?.youtubeUrl === 'string' && parseYouTubeLink(saved.youtubeUrl) ? saved.youtubeUrl : DEFAULT_YOUTUBE_URL,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

// La elección vale para todo el navegador y para la próxima vez, como los minutos del temporizador
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Sin almacenamiento la música funciona igual, pero se olvida al recargar
  }
}

// YouTube pide que su reproductor se vea mientras suena: sin video a la vista, no hay música de YouTube
function showVideo(url: string | null, autoplay: boolean) {
  const video = url ? parseYouTubeLink(url) : null
  videoBox.replaceChildren(...(video ? [createYouTubePlayer(video, autoplay)] : []))
  videoBox.hidden = !video
}

function showVolume() {
  const percent = Math.round(settings.volume * 100)
  volumeInput.value = String(percent)
  volumeInput.style.setProperty('--value', `${percent}%`)
  volumeText.textContent = `${percent}%`
}

function render() {
  for (const button of modeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.music === settings.mode))
  }
  volumeField.hidden = settings.mode !== 'studyfocus'
  youtubeForm.hidden = settings.mode !== 'youtube'
  toggleLabel.textContent = LABELS[settings.mode]
  musicSection.dataset.playing = String(settings.mode !== 'off')
}

// Al entrar a la sala el video de YouTube queda en pausa; al elegirlo o poner un link, parte solo
function play(autoplay: boolean) {
  if (settings.mode === 'studyfocus') {
    startLofi()
  } else {
    stopLofi()
  }
  showVideo(settings.mode === 'youtube' ? settings.youtubeUrl : null, autoplay)
}

function setMode(mode: MusicMode) {
  settings.mode = mode
  errorText.textContent = ''
  saveSettings()
  render()
  play(true)
}

function setPanelOpen(open: boolean) {
  panel.hidden = !open
  toggleButton.setAttribute('aria-expanded', String(open))
}

export function setUpMusic() {
  youtubeInput.value = settings.youtubeUrl
  setLofiVolume(settings.volume)
  showVolume()
  render()

  toggleButton.addEventListener('click', () => setPanelOpen(toggleButton.getAttribute('aria-expanded') !== 'true'))

  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.music as MusicMode))
  }

  volumeInput.addEventListener('input', () => {
    settings.volume = Number(volumeInput.value) / 100
    setLofiVolume(settings.volume)
    showVolume()
    saveSettings()
  })

  youtubeForm.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!parseYouTubeLink(youtubeInput.value)) {
      errorText.textContent = 'Ese no es un link de un video de YouTube.'
      return
    }
    errorText.textContent = ''
    settings.youtubeUrl = youtubeInput.value.trim()
    saveSettings()
    showVideo(settings.youtubeUrl, true)
  })

  // Cerrar el panel deja ver el video de YouTube, y la música sigue sonando
  closeButton.addEventListener('click', () => {
    setPanelOpen(false)
    toggleButton.focus()
  })

  // Esc cierra el panel, sin tocar la música
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setPanelOpen(false)
      toggleButton.focus()
    }
  })

  musicSection.hidden = false
  play(false)
}
