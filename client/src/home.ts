import { createRoom, joinRoom } from './network'

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

export function showHome(onEnter: (nickname: string) => void) {
  const codeFromUrl = new URLSearchParams(window.location.search).get('sala')
  if (codeFromUrl) {
    codeInput.value = codeFromUrl
  }

  function enter(code: string, nickname: string) {
    saveCodeInUrl(code)
    roomCodeText.textContent = code
    home.hidden = true
    hud.hidden = false
    onEnter(nickname)
  }

  copyLinkButton.addEventListener('click', copyLink)

  createButton.addEventListener('click', async () => {
    const nickname = readNickname()
    if (!nickname) return

    enter(await createRoom(nickname), nickname)
  })

  joinButton.addEventListener('click', async () => {
    const nickname = readNickname()
    if (!nickname) return

    const code = codeInput.value.trim().toUpperCase()
    if (await joinRoom(code, nickname)) {
      enter(code, nickname)
    } else {
      errorText.textContent = 'Esa sala no existe o está llena.'
    }
  })
}