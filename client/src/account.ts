// Las llamadas al servidor sobre la cuenta. La sesión vive en una cookie que esta página no puede leer.

// Lo que cada persona cuenta de sí misma. Todo es opcional.
export interface Profile {
  name: string
  username: string | null
  bio: string | null
  studies: string | null
  institution: string | null
  country: string | null // código de dos letras, como CL
}

export interface Account {
  name: string // el apodo, que ven los demás en la sala
  email: string | null
  username: string | null // único y fijo; las cuentas de antes lo eligen al entrar
  profile: Profile
  nextNameChange: string | null // desde cuándo se puede volver a cambiar el apodo
}

export interface AccountInfo {
  isAvailable: boolean
  googleClientId: string | null
  account: Account | null
}

type AccountResult = { account: Account; error: null } | { account: null; error: string }

const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const GOOGLE_BUTTON_WIDTH = 300 // píxeles
const CONNECTION_ERROR = 'No se pudo conectar con el servidor. Revisa tu conexión.'

declare const google: {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void
    }
  }
}

export async function loadAccount(): Promise<AccountInfo | null> {
  try {
    const response = await fetch('/api/account')
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

export async function sendAccount(path: string, body: unknown = {}): Promise<AccountResult> {
  try {
    const response = await fetch(`/api/account/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result: Account & { error?: string } = await response.json()
    if (!response.ok) return { account: null, error: result.error ?? 'No se pudo completar.' }
    return { account: result, error: null }
  } catch {
    return { account: null, error: CONNECTION_ERROR }
  }
}

export async function loadProfile(username: string): Promise<Profile | null> {
  try {
    const response = await fetch(`/api/profile?usuario=${encodeURIComponent(username)}`)
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

// Solo aparece si el servidor tiene un ID de cliente de Google
export function setupGoogleButton(container: HTMLElement, clientId: string, onCredential: (credential: string) => void) {
  const script = document.createElement('script')
  script.src = GOOGLE_SCRIPT_URL
  script.async = true
  script.addEventListener('load', () => {
    google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }) => onCredential(credential) })
    google.accounts.id.renderButton(container, {
      theme: 'filled_black',
      text: 'continue_with',
      width: GOOGLE_BUTTON_WIDTH,
      locale: 'es',
    })
  })
  document.head.append(script)
  container.hidden = false
}
