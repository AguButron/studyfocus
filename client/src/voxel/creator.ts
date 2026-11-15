import './voxelPages.css'
import * as THREE from 'three'
import { PROPS, PROPS_BY_ID, type PropCategory } from './props'
import { buildRoom, type FloorStyle, type PlacedProp, type RoomDesign, type RoomTheme, type Sky, type WallStyle } from './roomBuilder'
import { createVoxelView } from './voxelView'
import { rotate, VOXEL_SIZE } from './voxels'

// "Crea tu sala": un espacio vacío donde se ponen los muebles del catálogo (props.ts), se mueven, se giran y se
// les cambia el color. La sala se guarda en este navegador (STORAGE_KEY) como un diseño más (RoomDesign), así
// que más adelante se puede guardar en la cuenta y abrir como sala de verdad: sus sillas son los asientos.

const STORAGE_KEY = 'studyfocus.customRoom'
const CLICK_TOLERANCE = 5 // píxeles: si el mouse se movió más, era para girar la cámara, no un clic
const CATEGORY_NAMES: Record<PropCategory, string> = {
  mesas: 'Mesas', asientos: 'Asientos', muebles: 'Muebles', pared: 'En la pared', luces: 'Luces', plantas: 'Plantas', piso: 'Piso',
}

interface CustomRoom {
  unit?: number // el tamaño del cubo en cm: las salas guardadas con cubos más grandes (10 o 5 cm) se pasan a 2,5 cm al abrirlas
  size: { width: number; depth: number }
  theme: RoomTheme
  props: PlacedProp[]
}

const DEFAULT_ROOM: CustomRoom = {
  unit: 2.5,
  size: { width: 320, depth: 280 },
  theme: {
    floor: { style: 'tablas', color: 0x9c6b48, accent: 0x8a5a3c },
    wall: { style: 'zocalo', color: 0x8e93b0, accent: 0x50536f },
    sky: 'tarde',
  },
  props: [
    { id: 'rug', x: 0, z: 0, options: { pattern: 'rombo', size: 'grande' } },
    { id: 'table4', x: 0, z: 0 },
    { id: 'chair', x: -24, z: -48, rotation: 0 },
    { id: 'chair', x: 24, z: -48, rotation: 0 },
    { id: 'chair', x: -24, z: 48, rotation: 180 },
    { id: 'chair', x: 24, z: 48, rotation: 180 },
    { id: 'window', x: 0, z: -136, rotation: 0 },
    { id: 'floorLamp', x: -132, z: -116 },
    { id: 'tallPlant', x: 132, z: 116 },
  ],
}

const view = createVoxelView(document.querySelector<HTMLDivElement>('#view')!)
const canvas = view.renderer.domElement
const hint = document.querySelector<HTMLSpanElement>('#hint')!
const message = document.querySelector<HTMLParagraphElement>('#message')!
const summary = document.querySelector<HTMLParagraphElement>('#summary')!
const selectedBox = document.querySelector<HTMLElement>('#selected')!
const selectedName = document.querySelector<HTMLSpanElement>('#selected-name')!
const selectedFields = document.querySelector<HTMLDivElement>('#selected-fields')!
const chairsRow = document.querySelector<HTMLDivElement>('#chairs-row')!

let room: CustomRoom = loadRoom()
let selected: number | null = null
let placing: string | null = null // el mueble que se va a poner con el próximo clic
let moving = false
const history: string[] = []

function loadRoom(): CustomRoom {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved?.size && saved?.theme && Array.isArray(saved?.props)) {
      if (saved.unit !== 2.5) {
        // Guardada con cubos de 10 o 5 cm (las más viejas no dicen): todo se multiplica para cubos de 2,5 cm
        const factor = (saved.unit ?? 10) / 2.5
        saved.size = { width: saved.size.width * factor, depth: saved.size.depth * factor }
        for (const prop of saved.props as PlacedProp[]) {
          prop.x *= factor
          prop.z *= factor
          if (prop.y !== undefined) prop.y *= factor
        }
        saved.unit = 2.5
      }
      return saved
    }
  } catch {
    // Una sala guardada que no se entiende: se parte de nuevo
  }
  return structuredClone(DEFAULT_ROOM)
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(room))
  } catch {
    // Sin almacenamiento la sala dura hasta cerrar la página
  }
}

// Antes de cada cambio, para poder deshacerlo
function remember() {
  history.push(JSON.stringify(room))
  if (history.length > 80) history.shift()
}

function bounds() {
  const x0 = -Math.floor(room.size.width / 2)
  const z0 = -Math.floor(room.size.depth / 2)
  return { x0, x1: x0 + room.size.width, z0, z1: z0 + room.size.depth }
}

// Lo que ocupa un mueble en el piso, ya girado
function footprint(prop: PlacedProp) {
  const def = PROPS_BY_ID.get(prop.id)!
  const turned = (prop.rotation ?? 0) % 180 !== 0
  return { width: turned ? def.depth : def.width, depth: turned ? def.width : def.depth }
}

// ─── Dibujar ───
const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xf2c14e }))
const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x89b4fa }))
outline.visible = false
ghost.visible = false
view.scene.add(outline, ghost)

function placeBox(box: THREE.LineSegments, prop: PlacedProp | null) {
  box.visible = prop !== null
  if (!prop) return
  const def = PROPS_BY_ID.get(prop.id)!
  const height = def.category === 'piso' ? 0.05 : def.onWall ? 1.4 : 1
  const y = (prop.y ?? def.y ?? 0) * VOXEL_SIZE
  // Las esquinas del mueble, giradas igual que sus cubos: así el recuadro calza también con medidas pares
  const corners = [
    rotate(-Math.floor(def.width / 2), -Math.floor(def.depth / 2), prop.rotation ?? 0),
    rotate(def.width - Math.floor(def.width / 2) - 1, def.depth - Math.floor(def.depth / 2) - 1, prop.rotation ?? 0),
  ]
  const minX = Math.min(corners[0][0], corners[1][0]) + prop.x
  const maxX = Math.max(corners[0][0], corners[1][0]) + prop.x + 1
  const minZ = Math.min(corners[0][1], corners[1][1]) + prop.z
  const maxZ = Math.max(corners[0][1], corners[1][1]) + prop.z + 1
  box.scale.set((maxX - minX) * VOXEL_SIZE + 0.04, height, (maxZ - minZ) * VOXEL_SIZE + 0.04)
  box.position.set(((minX + maxX) / 2) * VOXEL_SIZE, y + height / 2, ((minZ + maxZ) / 2) * VOXEL_SIZE)
}

function rebuild(keepCamera = true) {
  const design: RoomDesign = {
    id: 'propia', kind: 'propia', name: 'Tu sala', description: '', theme: room.theme, size: room.size, props: room.props,
  }
  view.show(buildRoom(design), room.theme.sky, keepCamera)
  placeBox(outline, selected === null ? null : room.props[selected])
  const seats = room.props.filter((prop) => prop.id === 'chair').length
  summary.textContent = `${room.props.length} cosas · ${seats} ${seats === 1 ? 'asiento' : 'asientos'} (cada silla es un asiento)`
  save()
}

// ─── El catálogo ───
function renderCatalog() {
  const box = document.querySelector<HTMLDivElement>('#catalog')!
  const categories = [...new Set(PROPS.map((prop) => prop.category))]
  box.replaceChildren(...categories.flatMap((category) => {
    const title = document.createElement('p')
    title.textContent = CATEGORY_NAMES[category]
    title.style.margin = '8px 0 4px'
    const grid = document.createElement('div')
    grid.className = 'vx-catalog'
    grid.append(...PROPS.filter((prop) => prop.category === category).map((prop) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'vx-btn'
      button.textContent = prop.name
      button.setAttribute('aria-pressed', String(placing === prop.id))
      button.addEventListener('click', () => {
        placing = placing === prop.id ? null : prop.id
        moving = false
        select(null)
        renderCatalog()
        hint.textContent = placing ? `Haz clic en el piso para poner: ${prop.name}${prop.onWall ? ' (se pega a la pared más cercana)' : ''}. Shift + clic pone varios. Escape cancela.` : 'Elige un mueble a la izquierda'
      })
      return button
    }))
    return [title, grid]
  }))
}

// ─── Elegir y editar ───
function select(index: number | null) {
  selected = index
  selectedBox.hidden = index === null
  placeBox(outline, index === null ? null : room.props[index])
  if (index === null) return
  const prop = room.props[index]
  const def = PROPS_BY_ID.get(prop.id)!
  selectedName.textContent = def.name
  chairsRow.hidden = !['table4', 'table2', 'desk'].includes(prop.id)
  const fields: HTMLElement[] = []
  for (const [key, color] of Object.entries(def.colors)) {
    const label = document.createElement('label')
    label.className = 'vx-label'
    label.textContent = color.label
    const input = document.createElement('input')
    input.type = 'color'
    input.value = `#${(prop.colors?.[key] ?? color.value).toString(16).padStart(6, '0')}`
    input.addEventListener('change', () => {
      remember()
      prop.colors = { ...prop.colors, [key]: Number.parseInt(input.value.slice(1), 16) }
      rebuild()
    })
    label.append(input)
    fields.push(label)
  }
  for (const [key, option] of Object.entries(def.options ?? {})) {
    const label = document.createElement('label')
    label.className = 'vx-label'
    label.textContent = option.label
    const input = document.createElement('select')
    input.append(...option.values.map((value) => new Option(value.charAt(0).toUpperCase() + value.slice(1), value)))
    input.value = prop.options?.[key] ?? option.values[0]
    input.addEventListener('change', () => {
      remember()
      prop.options = { ...prop.options, [key]: input.value }
      rebuild()
    })
    label.append(input)
    fields.push(label)
  }
  selectedFields.replaceChildren(...fields)
}

function update(change: (prop: PlacedProp) => void) {
  if (selected === null) return
  remember()
  change(room.props[selected])
  rebuild()
}

function clampInside(prop: PlacedProp) {
  const { x0, x1, z0, z1 } = bounds()
  const { width, depth } = footprint(prop)
  prop.x = Math.max(x0 + Math.floor(width / 2), Math.min(x1 - Math.ceil(width / 2), prop.x))
  prop.z = Math.max(z0 + Math.floor(depth / 2), Math.min(z1 - Math.ceil(depth / 2), prop.z))
}

// Lo que cuelga se pega a la pared más cercana (atrás, izquierda o derecha), mirando hacia la sala
function snapToWall(prop: PlacedProp, x: number, z: number) {
  const { x0, x1, z0 } = bounds()
  const half = Math.floor(PROPS_BY_ID.get(prop.id)!.depth / 2)
  const distances = [
    { wall: 'back', distance: z - z0 },
    { wall: 'left', distance: x - x0 },
    { wall: 'right', distance: x1 - x },
  ].sort((a, b) => a.distance - b.distance)
  if (distances[0].wall === 'back') Object.assign(prop, { x, z: z0 + half, rotation: 0 })
  else if (distances[0].wall === 'left') Object.assign(prop, { x: x0 + half, z, rotation: 90 })
  else Object.assign(prop, { x: x1 - 1 - half, z, rotation: 270 })
}

function moveTo(prop: PlacedProp, x: number, z: number) {
  if (PROPS_BY_ID.get(prop.id)!.onWall) snapToWall(prop, x, z)
  else Object.assign(prop, { x, z })
  clampInside(prop)
}

// ─── El mouse ───
const raycaster = new THREE.Raycaster()
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

function floorPoint(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect()
  const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
  raycaster.setFromCamera(pointer, view.camera)
  const point = new THREE.Vector3()
  if (!raycaster.ray.intersectPlane(floorPlane, point)) return null
  return { x: Math.floor(point.x / VOXEL_SIZE), z: Math.floor(point.z / VOXEL_SIZE) }
}

// El mueble bajo el mouse: el último puesto gana, salvo las alfombras, que quedan al final
function propAt(x: number, z: number) {
  const order = room.props.map((prop, index) => ({ prop, index })).sort((a, b) => Number(a.prop.id === 'rug') - Number(b.prop.id === 'rug'))
  for (const { prop, index } of [...order.filter((item) => item.prop.id !== 'rug').reverse(), ...order.filter((item) => item.prop.id === 'rug')]) {
    const { width, depth } = footprint(prop)
    const def = PROPS_BY_ID.get(prop.id)!
    const margin = def.onWall ? 6 : 0
    if (Math.abs(x - prop.x) <= width / 2 + margin && Math.abs(z - prop.z) <= depth / 2 + margin) return index
  }
  return null
}

let down: { x: number; y: number } | null = null
canvas.addEventListener('pointerdown', (event) => (down = { x: event.clientX, y: event.clientY }))
canvas.addEventListener('pointermove', (event) => {
  const point = floorPoint(event)
  const id = placing ?? (moving && selected !== null ? room.props[selected].id : null)
  if (!point || !id) {
    ghost.visible = false
    return
  }
  const preview: PlacedProp = { id, x: point.x, z: point.z, rotation: moving && selected !== null ? room.props[selected].rotation : 0 }
  moveTo(preview, point.x, point.z)
  placeBox(ghost, preview)
})
canvas.addEventListener('pointerup', (event) => {
  if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE) return
  const point = floorPoint(event)
  if (!point) return
  if (placing) {
    remember()
    const prop: PlacedProp = { id: placing, x: point.x, z: point.z, rotation: 0 }
    moveTo(prop, point.x, point.z)
    room.props.push(prop)
    // Con Shift se siguen poniendo más del mismo (por ejemplo, varias sillas)
    if (!event.shiftKey) {
      placing = null
      ghost.visible = false
      renderCatalog()
      hint.textContent = 'Listo. Con Shift + clic se ponen varios seguidos.'
    }
    rebuild()
    select(room.props.length - 1)
    return
  }
  if (moving && selected !== null) {
    update((prop) => moveTo(prop, point.x, point.z))
    moving = false
    ghost.visible = false
    hint.textContent = 'Listo. Elige otro mueble o haz clic en uno para editarlo.'
    return
  }
  select(propAt(point.x, point.z))
})

// ─── Botones y teclas ───
function rotateSelected() {
  update((prop) => {
    const def = PROPS_BY_ID.get(prop.id)!
    if (def.onWall) return // lo que cuelga mira siempre hacia la sala
    prop.rotation = ((prop.rotation ?? 0) + 90) % 360
    clampInside(prop)
  })
}

function deleteSelected() {
  if (selected === null) return
  remember()
  room.props.splice(selected, 1)
  select(null)
  rebuild()
}

// Las sillas de una mesa, en su lugar y mirando hacia ella
function addChairs() {
  if (selected === null) return
  const table = room.props[selected]
  const offsets: [number, number, number][] =
    table.id === 'table4' ? [[-24, -48, 0], [24, -48, 0], [-24, 48, 180], [24, 48, 180]]
      : table.id === 'table2' ? [[0, -48, 0], [0, 48, 180]]
        : [[0, 28, 180]]
  remember()
  for (const [dx, dz, facing] of offsets) {
    const [x, z] = rotate(dx, dz, table.rotation ?? 0)
    room.props.push({ id: 'chair', x: table.x + x, z: table.z + z, rotation: (facing + (table.rotation ?? 0)) % 360 })
  }
  rebuild()
}

function undo() {
  const previous = history.pop()
  if (!previous) return
  room = JSON.parse(previous)
  select(null)
  syncRoomFields()
  rebuild()
}

document.querySelector('#rotate')!.addEventListener('click', rotateSelected)
document.querySelector('#delete')!.addEventListener('click', deleteSelected)
document.querySelector('#add-chairs')!.addEventListener('click', addChairs)
document.querySelector('#undo')!.addEventListener('click', undo)
document.querySelector('#move')!.addEventListener('click', () => {
  moving = true
  placing = null
  hint.textContent = 'Haz clic en el piso donde quieras dejarlo. Escape para cancelar.'
})
document.querySelector('#duplicate')!.addEventListener('click', () => {
  if (selected === null) return
  remember()
  const copy = structuredClone(room.props[selected])
  moveTo(copy, copy.x + 12, copy.z + 12)
  room.props.push(copy)
  rebuild()
  select(room.props.length - 1)
})
document.querySelector('#reset')!.addEventListener('click', () => {
  remember()
  room = structuredClone(DEFAULT_ROOM)
  select(null)
  syncRoomFields()
  rebuild(false)
  message.textContent = 'Volviste a la sala de ejemplo. Con Deshacer recuperas la tuya.'
})
document.querySelector('#copy')!.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(room))
    message.textContent = 'Copiada. Así se guardaría en tu cuenta.'
  } catch {
    message.textContent = 'No se pudo copiar.'
  }
})
document.querySelector('#view-room')!.addEventListener('click', () => view.setView('room'))
const pixels = document.querySelector<HTMLButtonElement>('#pixels')!
pixels.addEventListener('click', () => {
  const next = pixels.getAttribute('aria-pressed') !== 'true'
  pixels.setAttribute('aria-pressed', String(next))
  view.setPixels(next)
})

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undo()
    return
  }
  if (event.key === 'Escape') {
    placing = null
    moving = false
    ghost.visible = false
    select(null)
    renderCatalog()
    hint.textContent = 'Elige un mueble a la izquierda'
    return
  }
  if (selected === null) return
  const step = event.shiftKey ? 20 : 4 // cubos de 2,5 cm: de a 10 cm, o de a 50 cm
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  if (moves[event.key]) {
    event.preventDefault()
    update((prop) => {
      prop.x += moves[event.key][0]
      prop.z += moves[event.key][1]
      clampInside(prop)
    })
  } else if (event.key === 'PageUp' || event.key === 'PageDown') {
    event.preventDefault()
    update((prop) => {
      const def = PROPS_BY_ID.get(prop.id)!
      prop.y = Math.max(0, Math.min(88, (prop.y ?? def.y ?? 0) + (event.key === 'PageUp' ? 2 : -2)))
    })
  } else if (event.key.toLowerCase() === 'r') rotateSelected()
  else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected()
})

// ─── La sala: tamaño, hora, piso y paredes ───
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`
const fields = {
  size: document.querySelector<HTMLSelectElement>('#size')!,
  sky: document.querySelector<HTMLSelectElement>('#sky')!,
  floorStyle: document.querySelector<HTMLSelectElement>('#floor-style')!,
  floorColor: document.querySelector<HTMLInputElement>('#floor-color')!,
  floorAccent: document.querySelector<HTMLInputElement>('#floor-accent')!,
  wallStyle: document.querySelector<HTMLSelectElement>('#wall-style')!,
  wallColor: document.querySelector<HTMLInputElement>('#wall-color')!,
  wallAccent: document.querySelector<HTMLInputElement>('#wall-accent')!,
}

function syncRoomFields() {
  fields.size.value = `${room.size.width}x${room.size.depth}`
  fields.sky.value = room.theme.sky
  fields.floorStyle.value = room.theme.floor.style
  fields.floorColor.value = hex(room.theme.floor.color)
  fields.floorAccent.value = hex(room.theme.floor.accent)
  fields.wallStyle.value = room.theme.wall.style
  fields.wallColor.value = hex(room.theme.wall.color)
  fields.wallAccent.value = hex(room.theme.wall.accent)
}

for (const field of Object.values(fields)) {
  field.addEventListener('change', () => {
    remember()
    const [width, depth] = fields.size.value.split('x').map(Number)
    const resized = width !== room.size.width || depth !== room.size.depth
    room.size = { width, depth }
    room.theme = {
      sky: fields.sky.value as Sky,
      floor: { style: fields.floorStyle.value as FloorStyle, color: Number.parseInt(fields.floorColor.value.slice(1), 16), accent: Number.parseInt(fields.floorAccent.value.slice(1), 16) },
      wall: { style: fields.wallStyle.value as WallStyle, color: Number.parseInt(fields.wallColor.value.slice(1), 16), accent: Number.parseInt(fields.wallAccent.value.slice(1), 16) },
    }
    // Con otro tamaño, lo que cuelga vuelve a su pared y nada queda afuera
    if (resized) for (const prop of room.props) moveTo(prop, prop.x, prop.z)
    rebuild(!resized)
  })
}

view.setPixels(true)
syncRoomFields()
renderCatalog()
rebuild(false)
view.start()
