// El idioma de la página: el del navegador, o el que se eligió en Ajustes o con el botón del globo.
// Los textos se escriben en español en el código y en index.html; en inglés, se traducen al aparecer en
// pantalla con el diccionario de en.ts (también los mensajes que manda el servidor).
import { EN } from './en'

export type Language = 'es' | 'en'

const KEY = 'studyfocus.language'
const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt']

function readLanguage(): Language {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'es' || saved === 'en') return saved
  } catch {
    // Sin almacenamiento, el del navegador
  }
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export const language = readLanguage()
// Para las fechas y los números (Intl)
export const LOCALE = language

// Cambia el idioma y recarga, para que todo se vuelva a escribir en el nuevo
export function setLanguage(next: Language) {
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Sin almacenamiento, el cambio dura solo esta visita
  }
  window.location.reload()
}

// Los textos con partes que cambian ("Hola, {}") se buscan con una expresión; las partes se traducen también
const patterns = Object.entries(EN)
  .filter(([source]) => source.includes('{}'))
  .map(([source, target]) => ({
    regex: new RegExp(`^${source.split('{}').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.*?)')}$`, 's'),
    target,
    // Gana la más específica: la que tiene más texto fijo ("atrasada, hace {} días" antes que "{} días")
    weight: source.replaceAll('{}', '').length,
  }))
  .sort((a, b) => b.weight - a.weight)
const misses = new Set<string>() // lo que ya se buscó sin éxito, para no volver a probar las expresiones

function translateTrimmed(text: string): string | null {
  const exact = EN[text]
  if (exact !== undefined) return exact
  if (misses.has(text)) return null
  for (const { regex, target } of patterns) {
    const match = text.match(regex)
    if (!match) continue
    let index = 1
    return target.replace(/\{\}/g, () => {
      const part = match[index++] ?? ''
      return translateTrimmed(part.trim()) ?? part
    })
  }
  if (misses.size > 5000) misses.clear()
  misses.add(text)
  return null
}

// Un texto en el idioma elegido. En español, tal cual
export function t(text: string) {
  if (language === 'es') return text
  const trimmed = text.trim()
  // Un texto de index.html puede venir en varias líneas: se busca con los espacios juntos
  const translated = trimmed ? translateTrimmed(trimmed.replace(/\s+/g, ' ')) : null
  return translated === null ? text : text.replace(trimmed, translated)
}

// Lo que escriben las personas (nombres, mensajes, notas) no se traduce: va dentro de translate="no"
// (el texto dentro de un textarea es lo escrito; su placeholder sí se traduce)
const isUserContent = (node: Node) =>
  Boolean((node instanceof Element ? node : node.parentElement)?.closest(node instanceof Element ? '[translate="no"], script, style' : '[translate="no"], script, style, textarea'))

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (isUserContent(node)) return
    const text = node.nodeValue ?? ''
    const translated = t(text)
    if (translated !== text) node.nodeValue = translated
    return
  }
  if (!(node instanceof Element) || isUserContent(node)) return
  for (const name of ATTRIBUTES) {
    const value = node.getAttribute(name)
    if (!value) continue
    const translated = t(value)
    if (translated !== value) node.setAttribute(name, translated)
  }
  for (const child of node.childNodes) translateNode(child)
}

// El globo (portada e inicio de sesión) pasa al otro idioma; en Ajustes se elige uno
function setUpLanguageControls() {
  const other: Language = language === 'es' ? 'en' : 'es'
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-language-toggle]')) {
    button.querySelector('[data-language-next]')!.textContent = other.toUpperCase()
    button.addEventListener('click', () => setLanguage(other))
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-language-choice]')) {
    const choice = button.dataset.languageChoice as Language
    button.setAttribute('aria-pressed', String(choice === language))
    button.addEventListener('click', () => choice !== language && setLanguage(choice))
  }
}

// En inglés: traduce la página y, desde ahí, todo lo que se agregue o cambie
export function startTranslation() {
  document.documentElement.lang = language
  setUpLanguageControls()
  if (language === 'es') return
  translateNode(document.body)
  document.title = t(document.title)
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(translateNode)
      else if (record.type === 'characterData') translateNode(record.target)
      else if (record.type === 'attributes' && record.target instanceof Element) {
        const value = record.target.getAttribute(record.attributeName!)
        if (value && !isUserContent(record.target)) {
          const translated = t(value)
          if (translated !== value) record.target.setAttribute(record.attributeName!, translated)
        }
      }
    }
  }).observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ATTRIBUTES })
}
