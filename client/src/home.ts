import { createRoom, joinRoom } from './network'

const home = document.querySelector<HTMLDivElement>('#home')!
const nicknameInput = document.querySelector<HTMLInputElement>('#nickname')!
const codeInput = document.querySelector<HTMLInputElement>('#code')!
const createButton = document.querySelector<HTMLButtonElement>('#create')!
const joinButton = document.querySelector<HTMLButtonElement>('#join')!
const errorText = document.querySelector<HTMLParagraphElement>('#home-error')!

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

export function showHome(onEnter: () => void) {
  const codeFromUrl = new URLSearchParams(window.location.search).get('sala')
  if (codeFromUrl) {
    codeInput.value = codeFromUrl
  }

  function enter(code: string) {
    saveCodeInUrl(code)
    home.hidden = true
    onEnter()
  }

  createButton.addEventListener('click', async () => {
    const nickname = readNickname()
    if (!nickname) return

    enter(await createRoom(nickname))
  })

  joinButton.addEventListener('click', async () => {
    const nickname = readNickname()
    if (!nickname) return

    const code = codeInput.value.trim().toUpperCase()
    if (await joinRoom(code, nickname)) {
      enter(code)
    } else {
      errorText.textContent = 'Esa sala no existe o está llena.'
    }
  })
}