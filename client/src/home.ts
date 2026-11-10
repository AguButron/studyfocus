import { loadAccount, type Account } from './account'
import { setRoomTheme } from './theme'
import type { Character } from './character'
import { chooseUsername, hideAuth, setUpAuth, showAuth } from './auth'
import { hideLanding, setUpLanding, showLanding } from './landing'
import { hideMenu, setUpMenu, showHomePanel, showMenu, showPersonPanel, showRoomsError } from './menu'
import { readProfileParam } from './profilePage'
import { createRoom, joinRoom, leaveRoom, onSessionReplaced, reconnect, resumeSavedRoom, type ResumedPlayer } from './network'
import { hideMusic, setUpMusic } from './music'
import { startFriends } from './friends'
import { onUnreadChange, setDrawerInRoom, toggleDrawer } from './friendsDrawer'
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
const duplicateConfirm = document.querySelector<HTMLDialogElement>('#duplicate-confirm')!
const duplicateText = document.querySelector<HTMLParagraphElement>('#duplicate-confirm-text')!
const replacedNotice = document.querySelector<HTMLDialogElement>('#replaced-notice')!

// "¿Cambiar la sesión a esta ventana?": responde true si se acepta
function askToTakeOver(code: string) {
  duplicateText.textContent = `Tu cuenta está en la sala ${code} desde otra ventana. ¿Cambiar la sesión a esta ventana? La otra volverá al menú.`
  return new Promise<boolean>((resolve) => {
    const yes = document.querySelector<HTMLButtonElement>('#duplicate-confirm-yes')!
    const no = document.querySelector<HTMLButtonElement>('#duplicate-confirm-no')!
    const finish = (answer: boolean) => {
      yes.removeEventListener('click', onYes)
      no.removeEventListener('click', onNo)
      duplicateConfirm.removeEventListener('close', onClose)
      if (duplicateConfirm.open) duplicateConfirm.close()
      resolve(answer)
    }
    const onYes = () => finish(true)
    const onNo = () => finish(false)
    const onClose = () => finish(false) // Escape
    yes.addEventListener('click', onYes)
    no.addEventListener('click', onNo)
    duplicateConfirm.addEventListener('close', onClose)
    duplicateConfirm.showModal()
  })
}

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

// Vuelve al menú sin recargar la página, para que la música siga sonando.
// La sala 3D queda quieta y escondida; si después se entra a otra, ahí sí se recarga (ver enter)
let showMenuAgain = () => window.location.reload()

async function leaveToMenu() {
  leaveRoomButton.disabled = true
  saveSummary(await leaveRoom())
  resetTimer()
  saveCodeInUrl(null)
  showMenuAgain()
  leaveRoomButton.disabled = false
}

export const SOLO_KIND = 'solo'

export async function showHome(
  onEnter: (nickname: string, character: Character, resumed: ResumedPlayer | null, isSolo: boolean) => void,
  onLeave: () => void, // detiene la sala, que queda escondida
) {
  let hasEnteredRoom = false // la sala 3D se arma una vez por página
  // Un link de invitación lleva a esa sala después de iniciar sesión
  let pendingCode = new URLSearchParams(window.location.search).get('sala')?.toUpperCase() ?? null
  let account: Account | null = null

  copyLinkButton.addEventListener('click', copyLink)
  // El botón de Amigos de la sala, con los mensajes sin leer
  for (const button of document.querySelectorAll<HTMLButtonElement>('.room-friends')) {
    button.addEventListener('click', toggleDrawer)
  }
  onUnreadChange((count) => {
    for (const badge of document.querySelectorAll<HTMLSpanElement>('.room-friends-unread')) {
      badge.hidden = count === 0
      badge.textContent = String(count)
    }
  })
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
  document.querySelector('#replaced-notice-ok')!.addEventListener('click', () => replacedNotice.close())

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
    // La sala 3D se arma una sola vez por página: para entrar a otra, se recarga y se retoma esta sesión
    // (la de la pestaña ya apunta a la sala nueva). Es lo único que corta la música.
    if (hasEnteredRoom) {
      window.location.reload()
      return
    }
    hasEnteredRoom = true
    // Dentro de la sala la interfaz se oscurece (Grafito); al salir vuelve al tema elegido
    setRoomTheme(true)
    // Estudiando solo no hay sala 3D ni link para compartir
    document.documentElement.dataset.mode = isSolo ? 'solo' : 'room'
    hudRoomLabel.textContent = isSolo ? 'Estudiando solo' : 'Sala'
    roomCodeText.textContent = code
    hideMenu()
    home.hidden = true
    hud.hidden = false
    // Los amigos y el chat siguen a mano dentro de la sala, en una pestaña flotante
    setDrawerInRoom(true)
    startFriends()
    onEnter(account.name, account.character, resumed, isSolo)
  }

  showMenuAgain = () => {
    onLeave()
    setDrawerInRoom(false)
    statusText.hidden = true // si la página partió dentro de la sala, el "Cargando…" seguía puesto
    setRoomTheme(false)
    delete document.documentElement.dataset.mode
    hud.hidden = true
    home.hidden = false
    if (account) showMenu(account)
    else window.location.reload()
  }

  async function join(code: string) {
    showRoomsError('')
    let result = await joinRoom(code)
    // Ya estás en esa sala desde otra ventana: se pregunta si cambiar la sesión a esta
    if (result === 'duplicate') {
      if (!(await askToTakeOver(code))) return
      result = await joinRoom(code, true)
    }
    if (result === 'joined') {
      enter(code, account!)
    } else if (result === 'duplicate') {
      showRoomsError('No se pudo cambiar la sesión a esta ventana. Prueba de nuevo.')
    } else {
      showRoomsError(`La sala ${code} no existe o está llena. Las salas se borran cuando quedan vacías.`)
    }
  }

  // La ventana que quedó atrás vuelve al menú y avisa por qué
  onSessionReplaced(() => {
    if (hud.hidden) return
    resetTimer()
    saveCodeInUrl(null)
    showMenuAgain()
    replacedNotice.showModal()
  })

  async function signedIn(nextAccount: Account) {
    hideAuth()
    account = nextAccount.username ? nextAccount : await chooseUsername()
    setUpMusic() // en el menú y en la sala, sin cortarse al pasar de uno a otro

    if (pendingCode) {
      const code = pendingCode
      pendingCode = null
      saveCodeInUrl(null)
      showMenu(account)
      await join(code)
    } else {
      // Un link al perfil de alguien (por ejemplo, desde su nombre dentro de una sala) abre esa página.
      // Se lee antes de abrir el menú, que al mostrar su primera sección limpia la dirección
      const profile = readProfileParam()
      showMenu(account)
      if (profile) showPersonPanel(profile)
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
        hideMusic()
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
      setUpMusic()
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
