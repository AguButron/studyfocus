import { reconnect } from './network'

const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const GOOGLE_BUTTON_WIDTH = 300 // píxeles

const accountSection = document.querySelector<HTMLDivElement>('#account')!
const signedInSection = document.querySelector<HTMLDivElement>('#account-signed-in')!
const signedOutSection = document.querySelector<HTMLDetailsElement>('#account-signed-out')!
const accountNameText = document.querySelector<HTMLElement>('#account-name')!
const logoutButton = document.querySelector<HTMLButtonElement>('#logout')!
const googleButton = document.querySelector<HTMLDivElement>('#google-button')!
const accountForm = document.querySelector<HTMLFormElement>('#account-form')!
const emailInput = document.querySelector<HTMLInputElement>('#account-email')!
const passwordInput = document.querySelector<HTMLInputElement>('#account-password')!
const accountError = document.querySelector<HTMLParagraphElement>('#account-error')!
const savedRoomsSection = document.querySelector<HTMLDivElement>('#saved-rooms')!
const savedRoomsList = document.querySelector<HTMLDivElement>('#saved-rooms-list')!

interface AccountInfo {
  isAvailable: boolean
  googleClientId: string | null
  name: string | null
}

declare const google: {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void
    }
  }
}

let nicknameInput: HTMLInputElement
let pickRoom: (code: string) => void = () => {}

async function showSavedRooms() {
  savedRoomsList.replaceChildren()

  let codes: string[] = []
  try {
    const response = await fetch('/api/account/rooms')
    if (response.ok) {
      codes = (await response.json()).rooms
    }
  } catch {
    // Sin la lista se puede entrar igual con el código
  }

  for (const code of codes) {
    const button = document.createElement('button')
    button.className = 'button button-ghost'
    button.type = 'button'
    button.textContent = code
    button.addEventListener('click', () => pickRoom(code))
    savedRoomsList.append(button)
  }
}

function showAccount(name: string | null) {
  signedInSection.hidden = name === null
  signedOutSection.hidden = name !== null
  accountNameText.textContent = name
  savedRoomsSection.hidden = name === null

  if (name) {
    showSavedRooms()
    if (!nicknameInput.value) {
      nicknameInput.value = name
    }
  }
}

async function send(path: string, body: unknown = {}) {
  accountError.textContent = ''

  try {
    const response = await fetch(`/api/account/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result: { name?: string; error?: string } = await response.json()
    if (!response.ok) {
      accountError.textContent = result.error ?? 'No se pudo completar.'
      return null
    }
    return result
  } catch {
    accountError.textContent = 'No se pudo conectar. Puedes entrar con tu apodo.'
    return null
  }
}

async function submitAccount(path: string, body: unknown) {
  const result = await send(path, body)
  if (result?.name) {
    passwordInput.value = ''
    showAccount(result.name)
    reconnect()
  }
}

function setupGoogleButton(clientId: string) {
  const script = document.createElement('script')
  script.src = GOOGLE_SCRIPT_URL
  script.async = true
  script.addEventListener('load', () => {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) => submitAccount('google', { credential }),
    })
    google.accounts.id.renderButton(googleButton, {
      theme: 'filled_black',
      text: 'continue_with',
      width: GOOGLE_BUTTON_WIDTH,
      locale: 'es',
    })
  })
  document.head.append(script)
  googleButton.hidden = false
}

export async function setupAccount(input: HTMLInputElement, onPickRoom: (code: string) => void) {
  nicknameInput = input
  pickRoom = onPickRoom

  accountForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const path = event.submitter?.dataset.path ?? 'login'
    submitAccount(path, { email: emailInput.value, password: passwordInput.value })
  })

  logoutButton.addEventListener('click', async () => {
    if (await send('logout')) {
      showAccount(null)
      reconnect()
    }
  })

  let info: AccountInfo
  try {
    const response = await fetch('/api/account')
    if (!response.ok) return
    info = await response.json()
  } catch {
    return // Sin cuentas se puede estudiar igual
  }
  if (!info.isAvailable) return

  accountSection.hidden = false
  showAccount(info.name)
  if (info.googleClientId) {
    setupGoogleButton(info.googleClientId)
  }
}
