import { setupAccount } from './account'
import { createRoom, joinRoom, resumeSavedRoom, type ResumedPlayer } from './network'

const home = document.querySelector<HTMLDivElement>('#home')!
const nicknameInput = document.querySelector<HTMLInputElement>('#nickname')!
const codeInput = document.querySelector<HTMLInputElement>('#code')!
const createButton = document.querySelector<HTMLButtonElement>('#create')!
const joinButton = document.querySelector<HTMLButtonElement>('#join')!
const errorText = document.querySelector<HTMLParagraphElement>('#home-error')!
const COPY_FEEDBACK_TIME = 2000 // milisegundos
const hud = document.querySelector<HTMLDivElement>('#hud')!
const roomCodeText = document.querySelector<HTMLSpanElement>('#room-code')!
const copyLinkButton = document.querySelector<HTMLButtonElement>('#copy-link')!

function readNickname() {
  const nickname = nicknameInput.value.trim()
  errorText.textContent = nickname ? '' : 'Escribe tu apodo.'
  return nickname
}

function saveCodeInUrl(code: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('sala', code)
  window.history.replaceState(null, '', url)
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copyLinkButton.textContent = '¡Copiado!'
  } catch {
    copyLinkButton.textContent = 'No se pudo copiar'
  }

  setTimeout(() => {
    copyLinkButton.textContent = 'Copiar link'
  }, COPY_FEEDBACK_TIME)
}

export async function showHome(onEnter: (nickname: string, resumed: ResumedPlayer | null) => void) {
  const codeFromUrl = new URLSearchParams(window.location.search).get('sala')
  if (codeFromUrl) {
    codeInput.value = codeFromUrl
  }

  function enter(code: string, nickname: string, resumed: ResumedPlayer | null = null) {
    saveCodeInUrl(code)
    roomCodeText.textContent = code
    home.hidden = true
    hud.hidden = false
    onEnter(nickname, resumed)
  }

  copyLinkButton.addEventListener('click', copyLink)

  createButton.addEventListener('click', async () => {
    const nickname = readNickname()
    if (!nickname) return

    enter(await createRoom(nickname), nickname)
  })

  async function join(code: string) {
    const nickname = readNickname()
    if (!nickname) return

    if (await joinRoom(code, nickname)) {
      enter(code, nickname)
    } else {
      errorText.textContent = 'Esa sala no existe o está llena.'
    }
  }

  joinButton.addEventListener('click', () => join(codeInput.value.trim().toUpperCase()))
  setupAccount(nicknameInput, join)

  if (!codeFromUrl) return

  // Oculta mientras pregunta, para que al recargar no se vea pasar la pantalla inicial
  home.hidden = true
  const resumed = await resumeSavedRoom(codeFromUrl)
  if (resumed) {
    enter(resumed.code, resumed.nickname, resumed)
  } else {
    home.hidden = false
  }
}