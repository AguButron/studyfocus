import { loadAccount, type Account } from './account'
import type { Character } from './character'
import { chooseUsername, hideAuth, setUpAuth, showAuth } from './auth'
import { hideLanding, setUpLanding, showLanding } from './landing'
import { hideMenu, setUpMenu, showHomePanel, showMenu, showRoomsError } from './menu'
import { createRoom, joinRoom, leaveRoom, reconnect, resumeSavedRoom, type ResumedPlayer } from './network'
import { saveSummary } from './stats'
import { getTimer, isTimerIdle, resetTimer } from './timer'

const COPY_FEEDBACK_TIME = 2000 // milisegundos
const UNAVAILABLE = 'StudyFocus no está disponible ahora. Prueba de nuevo en unos minutos.'

const home = document.querySelector<HTMLElement>('#home')!
const statusText = document.querySelector<HTMLParagraphElement>('#home-status')!
const hud = document.querySelector<HTMLElement>('#hud')!
const roomCodeText = document.querySelector<HTMLSpanElement>('#room-code')!
const hudRoomLabel = document.querySelector<HTMLSpanElement>('#hud-room-label')!
const copyLinkButton = document.querySelector<HTMLButtonElement>('#copy-link')!
const leaveRoomButton = document.querySelector<HTMLButtonElement>('#leave-room')!
const leaveConfirm = document.querySelector<HTMLDialogElement>('#leave-confirm')!

function saveCodeInUrl(code: string | null) {
  const url = new URL(window.location.href)
  if (code) {
    url.searchParams.set('sala', code)
  } else {
    url.searchParams.delete('sala')
  }
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

// Un periodo de estudio empezado, corriendo o en pausa, se pierde al salir. En el descanso no se pierde nada.
function isStudyPeriodStarted() {
  return getTimer().period === 'study' && !isTimerIdle()
}

function askToLeave() {
  if (isStudyPeriodStarted()) {
    leaveConfirm.showModal()
  } else {
    leaveToMenu()
  }
}

// Vuelve al menú recargando la página: así la sala 3D parte de cero la próxima vez
async function leaveToMenu() {
  leaveRoomButton.disabled = true
  saveSummary(await leaveRoom())
  resetTimer()
  saveCodeInUrl(null)
  window.location.reload()
}

export const SOLO_KIND = 'solo'

export async function showHome(
  onEnter: (nickname: string, character: Character, resumed: ResumedPlayer | null, isSolo: boolean) => void,
) {
  // Un link de invitación lleva a esa sala después de iniciar sesión
  let pendingCode = new URLSearchParams(window.location.search).get('sala')?.toUpperCase() ?? null
  let account: Account | null = null

  copyLinkButton.addEventListener('click', copyLink)
  leaveRoomButton.addEventListener('click', askToLeave)
  // Dentro de la sala o del temporizador, el logo también vuelve al menú
  for (const logo of document.querySelectorAll<HTMLButtonElement>('.room-logo')) {
    logo.addEventListener('click', askToLeave)
  }
  document.querySelector('#leave-confirm-yes')!.addEventListener('click', () => {
    leaveConfirm.close()
    leaveToMenu()
  })
  document.querySelector('#leave-confirm-no')!.addEventListener('click', () => leaveConfirm.close())

  setUpLanding({
    start() {
      hideLanding()
      if (account) {
        showMenu(account)
      } else {
        showAuth(null, 'register')
      }
    },
    logIn() {
      hideLanding()
      showAuth(null, 'login')
    },
  })

  // El logo lleva a Inicio con la sesión iniciada; sin sesión, a la portada
  for (const logo of document.querySelectorAll<HTMLButtonElement>('.home-logo')) {
    logo.addEventListener('click', () => {
      hideAuth()
      if (account) {
        hideLanding()
        showMenu(account)
        showHomePanel()
      } else {
        hideMenu()
        showLanding(false)
      }
    })
  }

  function enter(
    code: string,
    account: Pick<Account, 'name' | 'character'>,
    resumed: ResumedPlayer | null = null,
    kind = resumed?.kind ?? 'study',
  ) {
    const isSolo = kind === SOLO_KIND
    saveCodeInUrl(code)
    // Dentro de la sala la interfaz se oscurece (Grafito); al salir se recarga y vuelve a Papel
    document.documentElement.dataset.theme = 'grafito'
    // Estudiando solo no hay sala 3D ni link para compartir
    document.documentElement.dataset.mode = isSolo ? 'solo' : 'room'
    hudRoomLabel.textContent = isSolo ? 'Estudiando solo' : 'Sala'
    roomCodeText.textContent = code
    hideMenu()
    home.hidden = true
    hud.hidden = false
    onEnter(account.name, account.character, resumed, isSolo)
  }

  async function join(code: string) {
    showRoomsError('')
    if (await joinRoom(code)) {
      enter(code, account!)
    } else {
      showRoomsError(`La sala ${code} no existe o está llena. Las salas se borran cuando quedan vacías.`)
    }
  }

  async function signedIn(nextAccount: Account) {
    hideAuth()
    account = nextAccount.username ? nextAccount : await chooseUsername()

    if (pendingCode) {
      const code = pendingCode
      pendingCode = null
      saveCodeInUrl(null)
      showMenu(account)
      await join(code)
    } else {
      showMenu(account)
    }
  }

  setUpMenu({
    async createRoom(kind) {
      showRoomsError('')
      const code = await createRoom(kind)
      if (code) {
        enter(code, account!)
      } else {
        showRoomsError('No se pudo crear la sala. Prueba de nuevo.')
      }
    },
    async studySolo() {
      showRoomsError('')
      const code = await createRoom(SOLO_KIND)
      if (code) {
        enter(code, account!, null, SOLO_KIND)
      } else {
        showRoomsError('No se pudo empezar. Prueba de nuevo.')
      }
    },
    joinRoom: join,
    // El servidor lee la cuenta al conectarse: al cambiarla, hay que reconectar
    onAccountChange(nextAccount) {
      account = nextAccount
      reconnect()
      if (!nextAccount) {
        hideMenu()
        showAuth(null)
      }
    },
  })

  const info = await loadAccount()
  if (!info?.isAvailable) {
    statusText.textContent = UNAVAILABLE
    return
  }

  setUpAuth(info.googleClientId, info.testAccounts, (nextAccount) => {
    reconnect()
    signedIn(nextAccount)
  })

  // Al recargar dentro de una sala se vuelve a ella sin pasar por el menú
  if (pendingCode) {
    const resumed = await resumeSavedRoom(pendingCode)
    if (resumed) {
      account = info.account
      enter(resumed.code, { name: resumed.nickname, character: resumed.character }, resumed)
      return
    }
  }

  statusText.hidden = true
  // Quien llega sin sesión ve primero la portada, salvo que venga con un link de invitación
  if (info.account) {
    signedIn(info.account)
  } else if (pendingCode) {
    showAuth(pendingCode)
  } else {
    showLanding(false)
  }
}
