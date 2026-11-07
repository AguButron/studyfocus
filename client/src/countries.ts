// Los países para elegir la nacionalidad, con su nombre en español y su bandera

// Códigos de dos letras que Intl conoce pero no son países ni territorios. El servidor usa la misma lista.
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ'])
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const regionNames = new Intl.DisplayNames(['es'], { type: 'region', fallback: 'none' })

export interface Country {
  code: string
  name: string
}

// Intl no entrega la lista de países: se prueban todas las combinaciones de dos letras
export const COUNTRIES: Country[] = [...LETTERS]
  .flatMap((first) => [...LETTERS].map((second) => first + second))
  .filter((code) => !NOT_COUNTRIES.has(code))
  .flatMap((code) => {
    const name = regionNames.of(code)
    return name ? [{ code, name }] : []
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'es'))

export function getCountryName(code: string) {
  return regionNames.of(code) ?? code
}

// La bandera son dos letras especiales que el sistema dibuja juntas
export function getFlag(code: string) {
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65))
}
