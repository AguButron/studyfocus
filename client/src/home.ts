import { loadAccount, type Account } from './account'
import { setRoomTheme } from './theme'
import type { Character } from './character'
import { chooseUsername, hideAuth, setUpAuth, showAuth } from './auth'
import { hideLanding, setUpLanding, showLanding } from './landing'
import { hideMenu, setUpMenu, showHomePanel, showMenu, showPersonPanel, showRoomsError } from './menu'
import { readProfileParam } from './profilePage'
import { createRoom, joinRoom, leaveRoom, onSessionReplaced, reconnect, resumeSavedRoom, socket, type ResumedPlayer } from './network'
import { hideMusic, setUpMusic } from './music'
import { startFriends } from './friends'
import { setDrawerInRoom } from './friendsDrawer'
import { setUpRoomChat, startRoomChat, stopRoomChat } from './roomChat'
import { getRoomKind } from './roomKinds'
import { saveSummary } from './stats'
import { adoptTimer, getTimer, isTimerIdle, resetTimer } from './timer'

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
const duplicateTitle = document.querySelector<HTMLHeadingElement>('#duplicate-confirm-title')!
const duplicateText = document.querySelector<HTMLParagraphElement>('#duplicate-confirm-text')!
const replacedNotice = document.querySelector<HTMLDialogElement>('#replaced-notice')!

// "¿Cambiar la sesión a esta ventana?": responde true si se acepta. Sin código, es estudiando solo
function askToTakeOver(code: string | null) {
  duplicateTitle.textContent = code ? 'Parece que ya estás en esta sala' : 'Ya estás estudiando solo'
  duplicateText.textContent = code
    ? `Tu cuenta está en la sala ${code} desde otra ventana. ¿Cambiar la sesión a esta ventana? La otra volverá al menú.`
    : 'Estás estudiando solo en otra ventana. ¿Cambiar la sesión a esta ventana? La otra volverá al menú.'
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
  onEnter: (nickname: string, character: Character, resumed: ResumedPlayer | null, kind: string) => void, // kind: el tipo de sala
  onLeave: () => void, // detiene la sala, que queda escondida
  // Descarga la sala 3D antes de entrar a una (el servidor manda quiénes están adentro justo al entrar)
  prepareRoom: () => Promise<boolean>,
) {
  const ROOM_UNAVAILABLE = 'No se pudo cargar la sala. Revisa tu conexión y prueba de nuevo.'
  let hasEnteredRoom = false // la sala 3D se arma una vez por página
  // Un link de invitación lleva a esa sala después de iniciar sesión
  let pendingCode = new URLSearchParams(window.location.search).get('sala')?.toUpperCase() ?? null
  let account: Account | null = null

  // La sesión del navegador es la misma en todas las pestañas. Si en otra se entra con otra cuenta (o se
  // sale), esta quedaría mostrando una cuenta y usando otra: el chat no marcaría como leído, por ejemplo.
  const ACCOUNT_KEY = 'studyfocus.account'
  const announceAccount = (next: Account | null) => {
    try {
      localStorage.setItem(ACCOUNT_KEY, next?.username ?? '')
    } catch {
      // Sin almacenamiento, igual se nota al reconectar
    }
  }
  window.addEventListener('storage', (event) => {
    if (event.key === ACCOUNT_KEY && account && (event.newValue ?? '') !== (account.username ?? '')) window.location.reload()
  })
  socket.on('account:hello', ({ username }: { username: string | null }) => {
    if (account?.username && username !== account.username) window.location.reload()
  })

  setUpRoomChat()
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
    hudRoomLabel.textContent = isSolo ? 'Estudiando solo' : getRoomKind(kind).name
    roomCodeText.textContent = code
    hideMenu()
    home.hidden = true
    hud.hidden = false
    // Los amigos y el chat siguen a mano dentro de la sala, en una pestaña flotante
    setDrawerInRoom(true)
    startFriends()
    // El chat de la sala, solo si hay otros con quién hablar (estudiando solo no hay)
    if (!isSolo) startRoomChat(code)
    onEnter(account.name, account.character, resumed, kind)
  }

  showMenuAgain = () => {
    onLeave()
    stopRoomChat()
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
    if (!(await prepareRoom())) {
      showRoomsError(ROOM_UNAVAILABLE)
      return
    }
    let result = await joinRoom(code)
    // Ya estás en esa sala desde otra ventana: se pregunta si cambiar la sesión a esta
    if (result === 'duplicate') {
      if (!(await askToTakeOver(code))) return
      result = await joinRoom(code, true)
    }
    if (typeof result === 'object') {
      if (result.timer) adoptTimer(result.timer) // sigue con el temporizador de la otra ventana
      enter(code, account!, null, result.kind)
    } else if (result === 'duplicate') {
      showRoomsError('No se pudo cambiar la sesión a esta ventana. Prueba de nuevo.')
    } else {
      showRoomsError(`La sala ${code} no existe o está llena. Las salas se borran cuando quedan vacías.`)
    }
  }

  // La ventana que quedó atrás vuelve al menú y avisa por qué
  onSessionReplaced(() => {
    if (!home.hidden) return // ya estaba en el menú. (La barra de arriba no sirve: sentado o en el escritorio se esconde)
    resetTimer()
    saveCodeInUrl(null)
    showMenuAgain()
    replacedNotice.showModal()
  })

  async function signedIn(nextAccount: Account) {
    hideAuth()
    account = nextAccount.username ? nextAccount : await chooseUsername()
    announceAccount(account)
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
      if (!(await prepareRoom())) {
        showRoomsError(ROOM_UNAVAILABLE)
        return
      }
      const created = await createRoom(kind)
      if (created && created !== 'duplicate') {
        enter(created.code, account!, null, kind)
      } else {
        showRoomsError('No se pudo crear la sala. Prueba de nuevo.')
      }
    },
    async studySolo() {
      showRoomsError('')
      let created = await createRoom(SOLO_KIND)
      // Ya estás estudiando solo en otra ventana: se pregunta si cambiar la sesión a esta
      if (created === 'duplicate') {
        if (!(await askToTakeOver(null))) return
        created = await createRoom(SOLO_KIND, true)
      }
      if (created && created !== 'duplicate') {
        if (created.timer) adoptTimer(created.timer) // sigue con el temporizador de la otra ventana
        enter(created.code, account!, null, SOLO_KIND)
      } else {
        showRoomsError('No se pudo empezar. Prueba de nuevo.')
      }
    },
    joinRoom: join,
    // El servidor lee la cuenta al conectarse: al cambiarla, hay que reconectar
    onAccountChange(nextAccount) {
      account = nextAccount
      announceAccount(nextAccount)
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
    await prepareRoom() // puede ser una sala 3D; si falla, al entrar se vuelve a intentar
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
