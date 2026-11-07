import { sendAccount, setupGoogleButton, type Account } from './account'

type AuthMode = 'login' | 'register'

const authSection = document.querySelector<HTMLElement>('#auth')!
const inviteText = document.querySelector<HTMLParagraphElement>('#auth-invite')!
const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-auth-mode]')
const authForm = document.querySelector<HTMLFormElement>('#auth-form')!
const usernameField = document.querySelector<HTMLLabelElement>('#auth-username-field')!
const usernameInput = document.querySelector<HTMLInputElement>('#auth-username')!
const loginLabel = document.querySelector<HTMLSpanElement>('#auth-login-label')!
const nameField = document.querySelector<HTMLLabelElement>('#auth-name-field')!
const nameInput = document.querySelector<HTMLInputElement>('#auth-name')!
const emailInput = document.querySelector<HTMLInputElement>('#auth-email')!
const passwordInput = document.querySelector<HTMLInputElement>('#auth-password')!
const submitButton = document.querySelector<HTMLButtonElement>('#auth-submit')!
const googleButton = document.querySelector<HTMLDivElement>('#google-button')!
const errorText = document.querySelector<HTMLParagraphElement>('#auth-error')!
const chooseSection = document.querySelector<HTMLElement>('#choose-username')!
const chooseForm = document.querySelector<HTMLFormElement>('#choose-username-form')!
const chooseInput = document.querySelector<HTMLInputElement>('#choose-username-input')!
const chooseError = document.querySelector<HTMLParagraphElement>('#choose-username-error')!

let mode: AuthMode = 'login'
let signedInListener: (account: Account) => void = () => {}

function setMode(nextMode: AuthMode) {
  mode = nextMode
  const isRegister = mode === 'register'

  for (const button of modeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.authMode === mode))
  }
  usernameField.hidden = !isRegister
  usernameInput.required = isRegister
  nameField.hidden = !isRegister
  nameInput.required = isRegister
  // Para entrar sirve el correo o el nombre de usuario; para crear la cuenta se pide el correo
  loginLabel.textContent = isRegister ? 'Correo' : 'Correo o nombre de usuario'
  emailInput.type = isRegister ? 'email' : 'text'
  emailInput.autocomplete = isRegister ? 'email' : 'username'
  passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password'
  submitButton.textContent = isRegister ? 'Crear cuenta' : 'Entrar'
  errorText.textContent = ''
}

async function submit(path: string, body: unknown) {
  submitButton.disabled = true
  errorText.textContent = ''
  const { account, error } = await sendAccount(path, body)
  submitButton.disabled = false

  if (!account) {
    errorText.textContent = error
    return
  }
  passwordInput.value = ''
  signedInListener(account)
}

export function setUpAuth(googleClientId: string | null, onSignedIn: (account: Account) => void) {
  signedInListener = onSignedIn

  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.authMode as AuthMode))
  }

  authForm.addEventListener('submit', (event) => {
    event.preventDefault()
    if (mode === 'register') {
      submit('register', {
        username: usernameInput.value,
        name: nameInput.value,
        email: emailInput.value,
        password: passwordInput.value,
      })
    } else {
      submit('login', { login: emailInput.value, password: passwordInput.value })
    }
  })

  if (googleClientId) {
    setupGoogleButton(googleButton, googleClientId, (credential) => submit('google', { credential }))
  }
}

// Con un link de invitación, se avisa a qué sala se entrará después de iniciar sesión
export function showAuth(inviteCode: string | null, startMode: AuthMode = 'login') {
  setMode(startMode)
  inviteText.hidden = !inviteCode
  inviteText.textContent = inviteCode ? `Inicia sesión o crea una cuenta para entrar a la sala ${inviteCode}.` : ''
  authSection.hidden = false
  emailInput.focus()
}

export function hideAuth() {
  authSection.hidden = true
}

// Las cuentas creadas antes de que existiera, y las de Google, eligen su nombre de usuario una vez
export function chooseUsername(): Promise<Account> {
  chooseSection.hidden = false
  chooseInput.focus()

  return new Promise((resolve) => {
    const submitUsername = async (event: SubmitEvent) => {
      event.preventDefault()
      chooseError.textContent = ''
      const { account, error } = await sendAccount('username', { username: chooseInput.value })
      if (!account) {
        chooseError.textContent = error
        return
      }
      chooseForm.removeEventListener('submit', submitUsername)
      chooseSection.hidden = true
      resolve(account)
    }
    chooseForm.addEventListener('submit', submitUsername)
  })
}
