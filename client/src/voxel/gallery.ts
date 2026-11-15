import './voxelPages.css'
import * as THREE from 'three'
import { ACTIVITY_ITEMS, type ActivityKind } from '../choices'
import { getRoomLayout, layoutSeats } from '../roomLayout'
import { ROOM_KINDS } from '../roomKinds'
import { designsFor, getDesign } from './designs'
import { buildRoom } from './roomBuilder'
import { placeItem } from './studyItemMesh'
import { createVoxelView, type ViewName } from './voxelView'

// La galería de diseños de sala: se elige el tipo, se recorren sus diseños y se elige uno. Lo elegido se guarda
// en este navegador (CHOSEN_KEY), listo para cuando la sala de verdad use estos diseños.

const CHOSEN_KEY = 'studyfocus.roomDesigns' // { [tipo]: id del diseño }

const kindsBox = document.querySelector<HTMLDivElement>('#kinds')!
const designsBox = document.querySelector<HTMLDivElement>('#designs')!
const stats = document.querySelector<HTMLSpanElement>('#stats')!
const chosenText = document.querySelector<HTMLParagraphElement>('#chosen')!
const soon = document.querySelector<HTMLDivElement>('#soon')!
const chooseButton = document.querySelector<HTMLButtonElement>('#choose')!
const view = createVoxelView(document.querySelector<HTMLDivElement>('#view')!)

let kind = new URLSearchParams(location.search).get('tipo') ?? 'duo'
let designId = designsFor(kind)[0]?.id ?? ''

function loadChosen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CHOSEN_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function swatches(colors: number[]) {
  const box = document.createElement('span')
  box.className = 'vx-swatches'
  box.append(...colors.map((color) => {
    const swatch = document.createElement('i')
    swatch.style.background = `#${color.toString(16).padStart(6, '0')}`
    return swatch
  }))
  return box
}

function renderKinds() {
  kindsBox.replaceChildren(...ROOM_KINDS.map((option) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'vx-btn'
    button.textContent = `${option.name} · ${option.seats}`
    button.setAttribute('aria-pressed', String(option.id === kind))
    button.addEventListener('click', () => {
      kind = option.id
      designId = loadChosen()[kind] ?? designsFor(kind)[0]?.id ?? ''
      renderKinds()
      renderDesigns()
      show()
    })
    return button
  }))
}

function renderDesigns() {
  const chosen = loadChosen()[kind]
  designsBox.replaceChildren(...designsFor(kind).map((design) => {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'vx-card'
    card.setAttribute('aria-pressed', String(design.id === designId))
    const name = document.createElement('strong')
    name.textContent = design.id === chosen ? `${design.name} ✓` : design.name
    const text = document.createElement('span')
    text.textContent = design.description
    const { floor, wall } = design.theme
    card.append(name, text, swatches([floor.color, floor.accent, wall.color, wall.accent]))
    card.addEventListener('click', () => {
      designId = design.id
      renderDesigns()
      show()
    })
    return card
  }))
}

// Las cosas de estudio frente a cada asiento, como en la sala de verdad: cada asiento con una distinta, para
// ver todas las variantes y que quepan entre los adornos. "Cambiar" corre cuál le toca a cada uno
const ALL_ITEMS = (Object.keys(ACTIVITY_ITEMS) as ActivityKind[]).flatMap((activity) => ACTIVITY_ITEMS[activity].map((_, variant) => ({ activity, variant })))
let showStudy = true
let studyOffset = 0
let studyGroup: THREE.Group | null = null

function showStudyItems() {
  studyGroup?.removeFromParent()
  studyGroup = null
  if (!showStudy || !getDesign(designId)) return
  studyGroup = new THREE.Group()
  // En la galería la sala de cubos no baja 5 cm como en room.ts: la cubierta queda a 80 cm
  studyGroup.position.y = 0.05
  layoutSeats(getRoomLayout(kind)).forEach((seat, index) => {
    const { activity, variant } = ALL_ITEMS[(index + studyOffset) % ALL_ITEMS.length]
    const holder = new THREE.Group()
    holder.position.set(seat.x, 0, seat.z)
    holder.rotation.y = seat.facingZ > 0 ? Math.PI : 0
    placeItem(holder, activity, variant)
    studyGroup!.add(holder)
  })
  view.scene.add(studyGroup)
}

function show() {
  const design = getDesign(designId)
  // Las salas sin diseños todavía (Café, Biblioteca y Salón de estudio) muestran "Próximamente"
  soon.hidden = design !== null
  stats.hidden = design === null
  chooseButton.disabled = design === null
  history.replaceState(null, '', `?tipo=${kind}`)
  if (!design) {
    showStudyItems()
    return
  }
  const started = performance.now()
  const built = buildRoom(design)
  const drawn = view.show(built, design.theme.sky)
  const kindName = ROOM_KINDS.find((option) => option.id === kind)?.name ?? kind
  stats.textContent = `${kindName} · ${design.name} · cubos de 2,5 cm · ${drawn.cubes.toLocaleString('es')} cubos · ${drawn.triangles.toLocaleString('es')} triángulos · armada en ${Math.round(performance.now() - started)} ms`
  chosenText.textContent = ''
  showStudyItems()
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  button.addEventListener('click', () => {
    view.setView(button.dataset.view as ViewName)
    for (const other of document.querySelectorAll('[data-view]')) other.setAttribute('aria-pressed', String(other === button))
  })
}

function toggle(id: string, onChange: (isOn: boolean) => void) {
  const button = document.querySelector<HTMLButtonElement>(id)!
  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-pressed') !== 'true'
    button.setAttribute('aria-pressed', String(next))
    onChange(next)
  })
}
toggle('#pixels', (isOn) => view.setPixels(isOn))
toggle('#spin', (isOn) => (view.controls.autoRotate = isOn))
toggle('#study', (isOn) => {
  showStudy = isOn
  showStudyItems()
})
document.querySelector('#study-next')!.addEventListener('click', () => {
  studyOffset = (studyOffset + 1) % ALL_ITEMS.length
  showStudyItems()
})

chooseButton.addEventListener('click', () => {
  try {
    localStorage.setItem(CHOSEN_KEY, JSON.stringify({ ...loadChosen(), [kind]: designId }))
    chosenText.textContent = 'Guardado en este navegador: al crear una sala de este tipo, partirá con este diseño.'
  } catch {
    chosenText.textContent = 'No se pudo guardar en este navegador.'
  }
  renderDesigns()
})

view.setPixels(true)
renderKinds()
renderDesigns()
show()
view.start()
