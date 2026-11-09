// El tema de la interfaz fuera de la sala: claro (Papel), oscuro (Grafito) o automático, según el sistema.
// Dentro de una sala siempre es Grafito. La elección se guarda en el navegador; un script en index.html
// la aplica antes de pintar la página, para que no parpadee en claro al cargar.
export type ThemeChoice = 'auto' | 'claro' | 'oscuro'

const KEY = 'studyfocus.theme' // el mismo que usa el script de index.html
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
let inRoom = false

export function getThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'claro' || saved === 'oscuro') return saved
  } catch {
    // Sin almacenamiento, automático
  }
  return 'auto'
}

let choice = getThemeChoice()

function apply() {
  const isDark = inRoom || choice === 'oscuro' || (choice === 'auto' && darkQuery.matches)
  document.documentElement.dataset.theme = isDark ? 'grafito' : 'papel'
}

export function setThemeChoice(next: ThemeChoice) {
  choice = next
  try {
    if (next === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {
    // Sin almacenamiento, dura hasta recargar
  }
  apply()
}

// Dentro de la sala la interfaz se oscurece siempre
export function setRoomTheme(isInRoom: boolean) {
  inRoom = isInRoom
  apply()
}

// Las opciones de Perfil: un botón por tema, marcado el elegido
function setUpThemePicker(group: HTMLElement) {
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('button[data-theme-choice]')]
  const show = () => {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice))
  }
  for (const button of buttons) {
    button.addEventListener('click', () => {
      setThemeChoice(button.dataset.themeChoice as ThemeChoice)
      show()
    })
  }
  show()
}

// En automático, sigue al sistema si cambia mientras la página está abierta
darkQuery.addEventListener('change', apply)
apply()
const picker = document.querySelector<HTMLElement>('#theme-picker')
if (picker) setUpThemePicker(picker)
