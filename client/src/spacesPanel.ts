// La sección Carpetas (en el código, "espacios"): los semestres, proyectos y cursos, sus apartados, y el detalle de cada apartado
// con sus notas, su promedio y lo estudiado
import { kindName, loadSectionItems, reorderSectionItems, todayText, updateItem, type AgendaItem } from './agenda'
import { notifyAgendaChange, onAgendaChange, openAgendaDialog } from './agendaDialog'
import {
  archiveSpace,
  computeAverage,
  findExemption,
  describeRule,
  updateRules,
  type Rule,
  createSection,
  createSpace,
  DEFAULT_SCALE,
  deleteSection,
  deleteSpace,
  describeKind,
  findSection,
  formatGrade,
  roundGrade,
  getColors,
  getSpaces,
  loadSpaces,
  onSpacesChange,
  SPACE_KINDS,
  updateSection,
  updateSpace,
  type Section,
  type Space,
  type SpaceKind,
} from './spaces'
import { formatDuration } from './stats'
import { createInfoTip, describeRuleScope } from './infoTip'
import { openSyllabusUpload, refreshSyllabusSpace, setUpSyllabusImport } from './syllabusImport'
import { describeClasses } from './classes'
import { openClassDialog, setUpClassDialog } from './classDialog'
import { createWeekSchedule } from './weekSchedule'

const CONFIRM_TIME = 4000 // milisegundos que espera la confirmación de borrar

const homeView = document.querySelector<HTMLDivElement>('#spaces-home')!
const folderView = document.querySelector<HTMLDivElement>('#folder-view')!
const folderName = document.querySelector<HTMLHeadingElement>('#folder-name')!
const folderMeta = document.querySelector<HTMLParagraphElement>('#folder-meta')!
const folderSections = document.querySelector<HTMLDivElement>('#folder-sections')!
const folderEmpty = document.querySelector<HTMLParagraphElement>('#folder-empty')!
const folderAdd = document.querySelector<HTMLButtonElement>('#folder-add')!
const sectionBack = document.querySelector<HTMLButtonElement>('#section-back')!
const folderMessage = document.querySelector<HTMLParagraphElement>('#folder-message')!
const rulesBox = document.querySelector<HTMLDivElement>('#section-rules-box')!
const rulesList = document.querySelector<HTMLUListElement>('#section-rules')!
const sectionSchedule = document.querySelector<HTMLInputElement>('#section-schedule')!
const folderSchedule = document.querySelector<HTMLDivElement>('#folder-schedule')!
const folderScheduleGrid = document.querySelector<HTMLDivElement>('#folder-schedule-grid')!
const folderScheduleEmpty = document.querySelector<HTMLParagraphElement>('#folder-schedule-empty')!
const rulesField = document.querySelector<HTMLDivElement>('#section-rules-field')!
const rulesEditList = document.querySelector<HTMLUListElement>('#section-rules-edit')!

// Los requisitos mientras se editan en la ventana del ramo, y sus evaluaciones para elegir
let editingRules: Rule[] = []
let rulesItems: AgendaItem[] = []
const RULE_KINDS: { id: Rule['kind']; name: string }[] = [
  { id: 'average', name: 'Promedio de… al menos' },
  { id: 'each', name: 'Cada una de… al menos' },
  { id: 'exempt', name: 'Te eximes con promedio de…' },
]

// "Examen", "Examen y Prueba 3", "Examen, Prueba 3 y Tarea 2"
function joinNames(names: string[]) {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

// Si no se escribe una descripción, se arma sola: "Promedio de Prueba 1, Prueba 2 ≥ 4,0"
function describeNewRule(section: Section | null, rule: Rule) {
  const titleOf = (id: string) => rulesItems.find((item) => item.id === id)?.title
  const names = (rule.itemIds ?? []).map(titleOf).filter(Boolean).join(', ')
  const min = section ? formatGrade(section, rule.min) : String(rule.min).replace('.', ',')
  if (rule.kind === 'each') return `Cada una de ${names || 'las evaluaciones'} ≥ ${min}`
  if (rule.kind === 'exempt') {
    const exempted = joinNames((rule.exemptIds ?? []).map(titleOf).filter((title): title is string => !!title))
    return `Te eximes${exempted ? ` de ${exempted}` : ''} con promedio de ${names || 'las demás evaluaciones'} ≥ ${min}`
  }
  return names ? `Promedio de ${names} ≥ ${min}` : `Promedio final ≥ ${min}`
}

function createRuleEditor(rule: Rule) {
  const row = document.createElement('li')
  row.className = 'rule-edit'

  const top = document.createElement('div')
  top.className = 'rule-edit-row'
  const kind = document.createElement('select')
  kind.className = 'sf-input'
  kind.setAttribute('aria-label', 'Tipo de requisito')
  kind.append(...RULE_KINDS.map(({ id, name }) => new Option(name, id)))
  kind.value = rule.kind
  kind.addEventListener('change', () => {
    rule.kind = kind.value as Rule['kind']
    exempts.hidden = rule.kind !== 'exempt'
    showCount()
  })
  const min = document.createElement('input')
  min.className = 'sf-input'
  min.type = 'number'
  min.step = 'any'
  min.required = true
  min.value = String(rule.min)
  min.setAttribute('aria-label', 'Nota')
  min.title = 'Nota'
  min.addEventListener('input', () => (rule.min = readNumber(min)))
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'sf-btn sf-btn--sm sf-btn--quiet syllabus-remove'
  remove.textContent = '×'
  remove.setAttribute('aria-label', 'Quitar este requisito')
  remove.title = 'Quitar este requisito'
  remove.addEventListener('click', () => {
    editingRules = editingRules.filter((other) => other !== rule)
    renderRuleEditors()
  })
  top.append(kind, min, remove)

  const label = document.createElement('input')
  label.className = 'sf-input'
  label.maxLength = 120
  label.value = rule.label
  label.placeholder = 'Descripción (si la dejas vacía, se escribe sola)'
  label.setAttribute('aria-label', 'Descripción')
  label.addEventListener('input', () => (rule.label = label.value))

  const items = document.createElement('details')
  const summary = document.createElement('summary')
  const showCount = () => {
    const count = rule.itemIds?.length ?? 0
    // Para eximirse, sin marcar ninguna se promedian todas menos aquellas de las que te eximes
    const unmarked = rule.kind === 'exempt' ? 'todas las demás' : 'promedio final'
    summary.textContent = count === 0 ? `Evaluaciones: ninguna marcada (${unmarked})` : `Evaluaciones: ${count} marcadas`
  }
  showCount()
  const checks = document.createElement('div')
  checks.className = 'rule-edit-items'
  checks.append(
    ...rulesItems.map((item) => {
      const option = document.createElement('label')
      const check = document.createElement('input')
      check.type = 'checkbox'
      check.checked = rule.itemIds?.includes(item.id) ?? false
      check.addEventListener('change', () => {
        const ids = new Set(rule.itemIds ?? [])
        if (check.checked) ids.add(item.id)
        else ids.delete(item.id)
        rule.itemIds = ids.size > 0 ? [...ids] : null
        showCount()
      })
      option.append(check, item.title)
      return option
    }),
  )
  items.append(summary, checks)
  items.open = (rule.itemIds?.length ?? 0) === 0 && rule.label === ''

  // Solo en "Te eximes": de qué evaluaciones te eximes, como el examen
  const exempts = document.createElement('details')
  exempts.hidden = rule.kind !== 'exempt'
  const exemptsSummary = document.createElement('summary')
  const showExemptCount = () => {
    const count = rule.exemptIds?.length ?? 0
    exemptsSummary.textContent = count === 0 ? 'Te eximes de: ninguna marcada' : `Te eximes de: ${count} marcadas`
  }
  showExemptCount()
  const exemptChecks = document.createElement('div')
  exemptChecks.className = 'rule-edit-items'
  exemptChecks.append(
    ...rulesItems.map((item) => {
      const option = document.createElement('label')
      const check = document.createElement('input')
      check.type = 'checkbox'
      check.checked = rule.exemptIds?.includes(item.id) ?? false
      check.addEventListener('change', () => {
        const ids = new Set(rule.exemptIds ?? [])
        if (check.checked) ids.add(item.id)
        else ids.delete(item.id)
        rule.exemptIds = ids.size > 0 ? [...ids] : null
        showExemptCount()
      })
      option.append(check, item.title)
      return option
    }),
  )
  exempts.append(exemptsSummary, exemptChecks)
  exempts.open = rule.kind === 'exempt' && !rule.exemptIds?.length

  row.append(top, label, items, exempts)
  return row
}

function renderRuleEditors() {
  rulesEditList.replaceChildren(...editingRules.map(createRuleEditor))
}
const sectionView = document.querySelector<HTMLDivElement>('#section-view')!
const spacesList = document.querySelector<HTMLDivElement>('#spaces-list')!
const archivedBox = document.querySelector<HTMLDetailsElement>('#spaces-archived')!
const archivedList = document.querySelector<HTMLDivElement>('#spaces-archived-list')!
const emptyText = document.querySelector<HTMLParagraphElement>('#spaces-empty')!
const errorText = document.querySelector<HTMLParagraphElement>('#spaces-error')!

const spaceDialog = document.querySelector<HTMLDialogElement>('#space-dialog')!
const spaceForm = document.querySelector<HTMLFormElement>('#space-form')!
const spaceDialogTitle = document.querySelector<HTMLHeadingElement>('#space-dialog-title')!
const spaceName = document.querySelector<HTMLInputElement>('#space-name')!
const spaceKind = document.querySelector<HTMLSelectElement>('#space-kind')!
const spaceError = document.querySelector<HTMLParagraphElement>('#space-error')!
const spaceArchive = document.querySelector<HTMLButtonElement>('#space-archive')!
const spaceDelete = document.querySelector<HTMLButtonElement>('#space-delete')!

const sectionDialog = document.querySelector<HTMLDialogElement>('#section-dialog')!
const sectionForm = document.querySelector<HTMLFormElement>('#section-form')!
const sectionDialogTitle = document.querySelector<HTMLHeadingElement>('#section-dialog-title')!
const sectionName = document.querySelector<HTMLInputElement>('#section-name-input')!
const sectionColors = document.querySelector<HTMLDivElement>('#section-colors')!
const sectionCode = document.querySelector<HTMLInputElement>('#section-code')!
const sectionTeacher = document.querySelector<HTMLInputElement>('#section-teacher')!
const sectionPlace = document.querySelector<HTMLInputElement>('#section-place')!
const sectionGoal = document.querySelector<HTMLInputElement>('#section-goal')!
const gradeMinInput = document.querySelector<HTMLInputElement>('#section-grade-min')!
const gradeMaxInput = document.querySelector<HTMLInputElement>('#section-grade-max')!
const gradePassInput = document.querySelector<HTMLInputElement>('#section-grade-pass')!
const exigenciaInput = document.querySelector<HTMLInputElement>('#section-exigencia')!
const sectionError = document.querySelector<HTMLParagraphElement>('#section-error')!
const sectionDelete = document.querySelector<HTMLButtonElement>('#section-delete')!

const detailSwatch = document.querySelector<HTMLSpanElement>('#section-swatch')!
const detailName = document.querySelector<HTMLHeadingElement>('#section-name')!
const detailMeta = document.querySelector<HTMLParagraphElement>('#section-meta')!
const detailAverage = document.querySelector<HTMLElement>('#section-average')!
const detailEvaluated = document.querySelector<HTMLElement>('#section-evaluated')!
const detailWeek = document.querySelector<HTMLElement>('#section-week')!
const detailNeeded = document.querySelector<HTMLParagraphElement>('#section-needed')!
const detailExemption = document.querySelector<HTMLParagraphElement>('#section-exemption')!
const detailItems = document.querySelector<HTMLUListElement>('#section-items')!
const detailEmpty = document.querySelector<HTMLParagraphElement>('#section-items-empty')!
const itemsTitle = document.querySelector<HTMLHeadingElement>('#section-items-title')!

const dateFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })

let editingSpace: Space | null = null
let editingSection: Section | null = null
let sectionSpaceId: string | null = null // el espacio donde se crea el apartado
let chosenColor = ''
let openSpaceId: string | null = null // la carpeta abierta
let openSectionId: string | null = null
let detailRequest = 0

function confirmTwice(button: HTMLButtonElement, label: string, action: () => void) {
  if (!button.classList.contains('sf-btn--danger')) {
    button.classList.add('sf-btn--danger')
    button.textContent = `¿${label}?`
    window.setTimeout(() => resetDanger(button, label), CONFIRM_TIME)
    return
  }
  action()
}

function resetDanger(button: HTMLButtonElement, label: string) {
  button.classList.remove('sf-btn--danger')
  button.textContent = label
}

// "2 h de 5 h esta semana", con una barra de avance si tiene meta
function describeWeek(section: Section) {
  const studied = formatDuration(section.weekSeconds)
  if (!section.weeklyGoalMinutes) return `${studied} en los últimos 7 días`
  return `${studied} de ${formatDuration(section.weeklyGoalMinutes * 60)} esta semana`
}

const RECENT_KEY = 'studyfocus.recentSpace'
const homeSpaceCard = document.querySelector<HTMLDivElement>('#home-space-card')!
const homeSpaceEmpty = document.querySelector<HTMLDivElement>('#home-space-empty')!
const homeSpaceTitle = document.querySelector<HTMLHeadingElement>('#home-space-title')!
const homeSchedule = document.querySelector<HTMLDivElement>('#home-schedule')!
const homeScheduleGrid = document.querySelector<HTMLDivElement>('#home-schedule-grid')!
const homeScheduleEmpty = document.querySelector<HTMLParagraphElement>('#home-schedule-empty')!
let showSpacesPanel = () => {}

// El último espacio que se abrió, para mostrarlo en Inicio
function rememberSpace(spaceId: string) {
  try {
    localStorage.setItem(RECENT_KEY, spaceId)
  } catch {
    // Sin almacenamiento, Inicio muestra el primer espacio
  }
}

function findRecentSpace() {
  const active = getSpaces().filter((space) => !space.archived)
  let saved: string | null = null
  try {
    saved = localStorage.getItem(RECENT_KEY)
  } catch {
    // Sin almacenamiento se usa el primero
  }
  return active.find((space) => space.id === saved) ?? active[0] ?? null
}

function countSections(space: Space) {
  const labels = describeKind(space.kind)
  const count = space.sections.length
  return `${labels.name} · ${count} ${(count === 1 ? labels.section : labels.sections).toLowerCase()}`
}

function renderRecentSpace() {
  const space = findRecentSpace()
  homeSpaceEmpty.hidden = space !== null
  homeSpaceTitle.textContent = space ? 'Tu carpeta más reciente' : 'Tu carpeta'
  homeSpaceCard.replaceChildren(...(space ? [createRecentCard(space)] : []))
  // El horario de clases de esa carpeta, si tiene ramos que poner en él
  homeSchedule.hidden = !space || space.archived || space.sections.length === 0
  if (space) renderSchedule(space, homeScheduleGrid, homeScheduleEmpty)
}

// El horario con las clases que se pusieron a mano; al apretar una se cambia o se borra
function renderSchedule(space: Space, gridBox: HTMLElement, empty: HTMLElement) {
  const grid = createWeekSchedule(space.sections, (section, item) => openClassDialog(space.sections, { section, kind: item.kind }))
  gridBox.replaceChildren(...(grid ? [grid] : []))
  empty.hidden = !!grid
}

function createRecentCard(space: Space) {
  const card = document.createElement('article')
  card.className = 'home-folder sf-card'

  const head = document.createElement('div')
  head.className = 'home-folder-head'
  const title = document.createElement('div')
  const name = document.createElement('strong')
  name.textContent = space.name
  const kind = document.createElement('span')
  kind.className = 'sf-row-detail'
  kind.textContent = countSections(space)
  title.append(name, kind)
  const open = document.createElement('button')
  open.type = 'button'
  open.className = 'sf-btn sf-btn--sm'
  open.textContent = 'Abrir'
  open.addEventListener('click', () => {
    showSpacesPanel()
    openFolder(space.id)
  })
  head.append(title, open)
  card.append(head)

  if (space.sections.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'sf-row-detail'
    empty.textContent = `Aún no tiene ${describeKind(space.kind).sections.toLowerCase()}.`
    card.append(empty)
    return card
  }

  // Un punteo: cada uno con su color, y al apretarlo se abre su detalle
  const list = document.createElement('ul')
  list.className = 'home-folder-list'
  list.append(
    ...space.sections.map((section) => {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'home-folder-item'
      button.style.setProperty('--section', section.color)
      const label = document.createElement('span')
      label.textContent = section.name
      button.append(label)
      if (section.code) {
        const code = document.createElement('span')
        code.className = 'section-code'
        code.textContent = section.code
        button.append(code)
      }
      if (section.weekSeconds > 0) {
        const time = document.createElement('span')
        time.className = 'sf-row-detail'
        time.textContent = formatDuration(section.weekSeconds)
        button.append(time)
      }
      button.addEventListener('click', () => {
        showSpacesPanel()
        openSection(section.id)
      })
      item.append(button)
      return item
    }),
  )
  card.append(list)
  return card
}

function createSectionRow(section: Section) {
  const row = document.createElement('button')
  row.type = 'button'
  row.className = 'section-row'
  row.style.setProperty('--section', section.color)

  const name = document.createElement('strong')
  name.textContent = section.name
  if (section.code) {
    const code = document.createElement('span')
    code.className = 'section-code'
    code.textContent = section.code
    name.append(' ', code)
  }
  const detail = document.createElement('span')
  detail.className = 'sf-row-detail'
  detail.textContent = describeWeek(section)
  row.append(name, detail)

  if (section.weeklyGoalMinutes) {
    const bar = document.createElement('span')
    bar.className = 'section-goal'
    const share = Math.min(1, section.weekSeconds / (section.weeklyGoalMinutes * 60))
    bar.style.setProperty('--progress', `${share * 100}%`)
    row.append(bar)
  }
  row.addEventListener('click', () => openSection(section.id))
  return row
}

function createSpaceCard(space: Space) {
  const card = document.createElement('button')
  card.type = 'button'
  card.className = 'space-card sf-card'
  card.toggleAttribute('data-archived', space.archived)

  const head = document.createElement('span')
  head.className = 'space-card-head'
  head.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>'
  const title = document.createElement('span')
  title.className = 'space-card-title'
  const name = document.createElement('strong')
  name.textContent = space.name
  const kind = document.createElement('span')
  kind.className = 'sf-row-detail'
  kind.textContent = countSections(space)
  title.append(name, kind)
  head.append(title)

  // La lista de sus ramos, cada uno con un punto de su color
  const names = document.createElement('span')
  names.className = 'space-card-names'
  names.append(
    ...space.sections.map((section) => {
      const name = document.createElement('span')
      name.style.setProperty('--section', section.color)
      name.textContent = section.name
      return name
    }),
  )

  card.append(head)
  if (space.sections.length > 0) card.append(names)
  card.addEventListener('click', () => openFolder(space.id))
  return card
}

// ── Una carpeta abierta ────────────────────────────────────────────────

function showView(view: HTMLElement) {
  for (const item of [homeView, folderView, sectionView]) item.hidden = item !== view
}

function renderFolder() {
  const space = getSpaces().find((item) => item.id === openSpaceId)
  if (!space) {
    closeFolder()
    return
  }
  const labels = describeKind(space.kind)
  const week = space.sections.reduce((sum, section) => sum + section.weekSeconds, 0)
  folderName.textContent = space.name
  folderMeta.textContent = [countSections(space), week > 0 ? `${formatDuration(week)} en los últimos 7 días` : null, space.archived ? 'Archivada' : null]
    .filter(Boolean)
    .join(' · ')
  folderAdd.textContent = `+ Agregar ${labels.section.toLowerCase()}`
  folderAdd.hidden = space.archived
  folderSections.replaceChildren(...space.sections.map(createSectionRow))
  folderEmpty.hidden = space.sections.length > 0
  folderEmpty.textContent = `Esta carpeta aún está vacía. Usa «${folderAdd.textContent}» para empezar.`
  renderFolderSchedule(space)
}

// El horario de la semana con las clases de todos sus ramos
function renderFolderSchedule(space: Space) {
  folderSchedule.hidden = space.sections.length === 0
  document.querySelector<HTMLButtonElement>('#folder-schedule-add')!.hidden = space.archived
  renderSchedule(space, folderScheduleGrid, folderScheduleEmpty)
}

function openFolder(id: string) {
  openSpaceId = id
  openSectionId = null
  rememberSpace(id)
  renderRecentSpace()
  showView(folderView)
  renderFolder()
}

function closeFolder() {
  folderMessage.hidden = true
  openSpaceId = null
  openSectionId = null
  showView(homeView)
}

function renderSpaces() {
  const spaces = getSpaces()
  const active = spaces.filter((space) => !space.archived)
  const archived = spaces.filter((space) => space.archived)
  spacesList.replaceChildren(...active.map(createSpaceCard))
  archivedList.replaceChildren(...archived.map(createSpaceCard))
  archivedBox.hidden = archived.length === 0
  emptyText.hidden = spaces.length > 0
  renderRecentSpace()
  refreshSyllabusSpace()
  if (openSectionId) renderSection()
  else if (openSpaceId) renderFolder()
}

// ── Detalle de un apartado ─────────────────────────────────────────────

// ── Ordenar arrastrando ────────────────────────────────────────────────

function readOrder() {
  return [...detailItems.children].map((row) => (row as HTMLElement).dataset.id!)
}

async function saveOrder(before: string[]) {
  const ids = readOrder()
  if (!openSectionId || ids.join() === before.join()) return
  const { error } = await reorderSectionItems(openSectionId, ids)
  if (error) {
    errorText.textContent = error
    renderSection() // vuelve al orden guardado
  }
}

// Se toma de la manilla: con el mouse o el dedo se arrastra, y con el teclado se mueve con las flechas
function makeDraggable(row: HTMLLIElement, handle: HTMLButtonElement) {
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const before = readOrder()
    row.setAttribute('data-dragging', '')

    const move = (moveEvent: PointerEvent) => {
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLLIElement>('#section-items > li')
      if (!target || target === row) return
      const box = target.getBoundingClientRect()
      const isAfter = moveEvent.clientY > box.top + box.height / 2
      detailItems.insertBefore(row, isAfter ? target.nextSibling : target)
    }
    // En toda la ventana: el puntero sale de la manilla apenas se empieza a mover
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      row.removeAttribute('data-dragging')
      saveOrder(before)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  })

  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const before = readOrder()
    if (event.key === 'ArrowUp' && row.previousElementSibling) detailItems.insertBefore(row, row.previousElementSibling)
    if (event.key === 'ArrowDown' && row.nextElementSibling) detailItems.insertBefore(row.nextElementSibling, row)
    handle.focus()
    saveOrder(before)
  })
}

// ── Notas directo en la fila ───────────────────────────────────────────

let focusAfterRender: string | null = null // la nota que se sigue escribiendo tras guardar la anterior

function readGrade(value: string) {
  const text = value.trim().replace(',', '.')
  if (text === '') return null
  const grade = Number(text)
  return Number.isFinite(grade) ? grade : NaN
}

// Guarda solo la nota, con el resto de la evaluación tal cual. Vacía la borra.
async function saveGrade(item: AgendaItem, section: Section, input: HTMLInputElement) {
  if (input.disabled) return false // ya se está guardando (Enter y el cambio llegan juntos)
  const grade = readGrade(input.value)
  if (grade === item.grade) return true
  if (Number.isNaN(grade) || (grade !== null && (grade < section.gradeMin || grade > section.gradeMax))) {
    input.setCustomValidity(`Escribe una nota entre ${formatGrade(section, section.gradeMin)} y ${formatGrade(section, section.gradeMax)}.`)
    input.reportValidity()
    return false
  }
  input.setCustomValidity('')
  input.disabled = true
  const { id, done: _done, ...draft } = item
  const { error } = await updateItem(id, { ...draft, grade: grade === null ? null : roundGrade(section, grade) })
  input.disabled = false
  if (error) {
    errorText.textContent = error
    return false
  }
  item.grade = grade === null ? null : roundGrade(section, grade)
  notifyAgendaChange() // recalcula el promedio, los requisitos y el calendario
  return true
}

function createGradeInput(item: AgendaItem, section: Section) {
  const input = document.createElement('input')
  input.className = 'section-item-grade'
  input.inputMode = 'decimal'
  input.autocomplete = 'off'
  input.placeholder = '–'
  input.value = item.grade === null ? '' : formatGrade(section, item.grade)
  input.toggleAttribute('data-failing', item.grade !== null && item.grade < section.gradePass)
  input.setAttribute('aria-label', `Nota de ${item.title}`)
  input.title = 'Escribe la nota y aprieta Enter'
  input.dataset.itemId = item.id

  const restore = () => (input.value = item.grade === null ? '' : formatGrade(section, item.grade))
  input.addEventListener('focus', () => input.select())
  input.addEventListener('input', () => input.setCustomValidity(''))
  input.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') {
      restore()
      input.blur()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      // Enter guarda y pasa a la nota de la evaluación siguiente
      const rows = [...detailItems.children] as HTMLElement[]
      const next = rows[rows.findIndex((row) => row.dataset.id === item.id) + 1]
      if (await saveGrade(item, section, input)) {
        focusAfterRender = next?.dataset.id ?? null
        if (readGrade(input.value) === item.grade) next?.querySelector<HTMLInputElement>('.section-item-grade')?.focus()
      }
    }
  })
  input.addEventListener('change', () => saveGrade(item, section, input))
  return input
}

function createItemRow(item: AgendaItem, section: Section) {
  const row = document.createElement('li')
  row.className = 'section-item-row'
  row.dataset.id = item.id
  row.dataset.kind = item.kind

  const handle = document.createElement('button')
  handle.type = 'button'
  handle.className = 'section-item-handle'
  handle.setAttribute('aria-label', `Mover ${item.title}. Usa las flechas arriba y abajo.`)
  handle.title = 'Arrastra para ordenar'
  handle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" /></svg>'
  makeDraggable(row, handle)

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'section-item'
  button.dataset.kind = item.kind
  button.toggleAttribute('data-done', item.done)

  const main = document.createElement('span')
  main.className = 'section-item-main'
  const title = document.createElement('strong')
  title.textContent = item.title
  const detail = document.createElement('span')
  detail.className = 'sf-row-detail'
  const when = item.date ? dateFormat.format(new Date(`${item.date}T12:00:00`)) : 'Sin fecha'
  button.toggleAttribute('data-undated', !item.date)
  detail.textContent = `${kindName(item.kind)} · ${when}${item.done ? ' · hecha' : ''}`
  main.append(title, detail)

  const weight = document.createElement('span')
  weight.className = 'section-item-weight'
  weight.textContent = item.weight !== null ? `${String(item.weight).replace('.', ',')} %` : ''

  button.append(main, weight)
  button.addEventListener('click', () => openAgendaDialog(item, item.date))
  row.append(handle, button, createGradeInput(item, section))
  return row
}

async function renderSection() {
  const found = findSection(openSectionId)
  if (!found) {
    closeSection()
    return
  }
  const { section, space } = found
  const labels = describeKind(space.kind)
  sectionBack.textContent = `‹ ${space.name}`

  detailSwatch.style.background = section.color
  detailName.textContent = section.name
  const schedule = section.classes.length > 0 ? describeClasses(section.classes) : section.schedule
  detailMeta.textContent = [space.name, section.code, section.teacher, section.place, schedule].filter(Boolean).join(' · ')
  detailWeek.textContent = describeWeek(section)
  itemsTitle.textContent = labels.id === 'semestre' ? 'Evaluaciones y tareas' : 'Tareas y entregas'

  const current = ++detailRequest
  const { value: items, error } = await loadSectionItems(section.id)
  if (current !== detailRequest) return
  if (!items) {
    errorText.textContent = error
    return
  }

  // Mientras te puedas eximir, la nota se calcula como si te fueras a eximir
  const exemption = findExemption(section, items)
  const result = computeAverage(section, items, exemption)
  detailExemption.hidden = !exemption
  detailExemption.textContent = exemption
    ? `Calculado suponiendo que te eximes de ${joinNames(exemption.titles)}. ` +
      `Si no te eximes, ${exemption.titles.length === 1 ? 'cuenta' : 'cuentan'} ${Math.round(exemption.weight)} % de la nota.`
    : ''
  detailAverage.textContent = result.average === null ? '–' : formatGrade(section, result.average)
  detailAverage.toggleAttribute('data-failing', result.average !== null && result.average < section.gradePass)
  detailEvaluated.textContent = `${Math.round(result.evaluated)} %`

  // Lo que hace falta en lo que queda por evaluar para llegar a la nota de aprobación
  if (result.evaluated === 0) {
    detailNeeded.textContent = 'Anota el porcentaje y la nota de cada evaluación para ver tu promedio.'
  } else if (result.needed === null) {
    detailNeeded.textContent = result.average! >= section.gradePass ? 'Ya está todo evaluado: apruebas.' : 'Ya está todo evaluado.'
  } else if (result.needed <= section.gradeMin) {
    detailNeeded.textContent = `Te queda ${Math.round(result.remaining)} % por evaluar y ya alcanzas la nota para aprobar.`
  } else if (result.needed > section.gradeMax) {
    detailNeeded.textContent = `Te queda ${Math.round(result.remaining)} % por evaluar: no alcanza para la nota de aprobación.`
  } else {
    detailNeeded.textContent = `Te queda ${Math.round(result.remaining)} % por evaluar. Para aprobar necesitas un ${formatGrade(section, result.needed)} en promedio.`
  }

  detailItems.replaceChildren(...items.map((item) => createItemRow(item, section)))
  if (focusAfterRender) {
    detailItems.querySelector<HTMLInputElement>(`.section-item-grade[data-item-id="${focusAfterRender}"]`)?.focus()
    focusAfterRender = null
  }
  detailEmpty.hidden = items.length > 0
  renderRules(section, items)
}

// Los requisitos: cómo va cada uno, y el resumen que aparece al pasar el mouse por el ícono
function renderRules(section: Section, items: AgendaItem[]) {
  const statuses = section.rules.map((rule) => ({ rule, status: describeRule(section, rule, items) }))
  const icons = { met: '✓', failed: '✕', pending: '…' }

  rulesBox.hidden = statuses.length === 0
  // Llegar a la nota no basta si un requisito no se cumple, como un examen bajo el mínimo
  const failed = statuses.filter(({ status }) => status.state === 'failed')
  if (failed.length > 0) {
    detailNeeded.textContent += ` Pero no cumples ${failed.length === 1 ? 'un requisito' : 'algunos requisitos'}: ${failed.map(({ rule }) => rule.label).join('; ')}.`
  }
  rulesList.replaceChildren(
    ...statuses.map(({ rule, status }) => {
      const row = document.createElement('li')
      row.className = 'section-rule'
      row.dataset.state = status.state
      const icon = document.createElement('span')
      icon.className = 'section-rule-icon'
      icon.textContent = icons[status.state]
      icon.setAttribute('aria-label', { met: 'Cumples', failed: 'No cumples', pending: 'Aún no se sabe' }[status.state])
      const text = document.createElement('span')
      text.className = 'section-rule-text'
      const label = document.createElement('strong')
      label.className = 'section-rule-label'
      label.textContent = rule.label
      // Qué cuenta para el requisito: aparece al pasar el mouse por el (i)
      const counted = rule.itemIds
        ? rule.itemIds.flatMap((id) => items.filter((item) => item.id === id).map(({ title, weight }) => ({ title, weight })))
        : null
      const exempted = (rule.exemptIds ?? []).flatMap((id) => items.filter((item) => item.id === id).map(({ title }) => title))
      label.append(createInfoTip('Qué cuenta para este requisito', describeRuleScope(counted, exempted)))
      const detail = document.createElement('span')
      detail.className = 'sf-row-detail'
      detail.textContent = status.detail
      text.append(label, detail)
      row.append(icon, text)
      return row
    }),
  )
}

function openSection(id: string) {
  openSectionId = id
  const found = findSection(id)
  if (found) {
    openSpaceId = found.space.id
    rememberSpace(found.space.id)
    renderRecentSpace()
  }
  showView(sectionView)
  renderSection()
}

// Del detalle de un ramo se vuelve a su carpeta
function closeSection() {
  openSectionId = null
  if (openSpaceId) {
    showView(folderView)
    renderFolder()
  } else {
    showView(homeView)
  }
}

// ── Ventanas ───────────────────────────────────────────────────────────

function openSpaceDialog(space: Space | null) {
  editingSpace = space
  spaceError.textContent = ''
  resetDanger(spaceDelete, 'Borrar')
  spaceDialogTitle.textContent = space ? 'Editar carpeta' : 'Nueva carpeta'
  spaceName.value = space?.name ?? ''
  spaceKind.value = space?.kind ?? 'semestre'
  showSpaceExample()
  spaceArchive.hidden = !space
  spaceArchive.textContent = space?.archived ? 'Desarchivar' : 'Archivar'
  spaceDelete.hidden = !space
  spaceDialog.showModal()
  spaceName.focus()
}

function showSpaceExample() {
  spaceName.placeholder = describeKind(spaceKind.value as SpaceKind).example
}

function showColors() {
  for (const swatch of sectionColors.querySelectorAll<HTMLButtonElement>('button')) {
    swatch.setAttribute('aria-pressed', String(swatch.dataset.color === chosenColor))
  }
}

function fillColors() {
  sectionColors.replaceChildren(
    ...getColors().map((color) => {
      const swatch = document.createElement('button')
      swatch.type = 'button'
      swatch.className = 'character-swatch'
      swatch.dataset.color = color
      swatch.style.setProperty('--swatch', color)
      swatch.setAttribute('aria-label', color)
      swatch.addEventListener('click', () => {
        chosenColor = color
        showColors()
      })
      return swatch
    }),
  )
}

function openSectionDialog(section: Section | null, spaceId: string) {
  editingSection = section
  sectionSpaceId = spaceId
  const space = getSpaces().find((item) => item.id === spaceId)
  const labels = describeKind(space?.kind ?? 'otro')
  sectionError.textContent = ''
  resetDanger(sectionDelete, 'Borrar')
  sectionDialogTitle.textContent = section ? `Editar ${labels.section.toLowerCase()}` : `Nuevo ${labels.section.toLowerCase()}`

  fillColors()
  // Un color que todavía no use otro apartado del mismo espacio
  const used = new Set(space?.sections.map((item) => item.color))
  chosenColor = section?.color ?? getColors().find((color) => !used.has(color)) ?? getColors()[0]
  showColors()

  sectionName.value = section?.name ?? ''
  sectionCode.value = section?.code ?? ''
  sectionTeacher.value = section?.teacher ?? ''
  sectionPlace.value = section?.place ?? ''
  sectionSchedule.value = section?.schedule ?? ''
  // Los requisitos se editan sobre una copia; se guardan con el resto del ramo
  editingRules = (section?.rules ?? []).map((rule) => ({
    ...rule,
    itemIds: rule.itemIds ? [...rule.itemIds] : null,
    exemptIds: rule.exemptIds ? [...rule.exemptIds] : null,
  }))
  rulesItems = []
  rulesField.hidden = !section // uno nuevo aún no tiene evaluaciones a las que apuntar
  renderRuleEditors()
  if (section) {
    loadSectionItems(section.id).then(({ value }) => {
      if (editingSection !== section || !value) return
      rulesItems = value
      renderRuleEditors()
    })
  }
  sectionGoal.value = section?.weeklyGoalMinutes ? String(section.weeklyGoalMinutes / 60) : ''
  const scale = section ?? DEFAULT_SCALE
  gradeMinInput.value = String(scale.gradeMin)
  gradeMaxInput.value = String(scale.gradeMax)
  gradePassInput.value = String(scale.gradePass)
  exigenciaInput.value = String(scale.exigencia)
  sectionDelete.hidden = !section
  sectionDialog.showModal()
  sectionName.focus()
}

function readNumber(input: HTMLInputElement) {
  return Number(input.value.replace(',', '.'))
}

export function setUpSpacesPanel(openSpacesPanel: () => void) {
  showSpacesPanel = openSpacesPanel
  spaceKind.replaceChildren(...SPACE_KINDS.map(({ id, name }) => new Option(name, id)))
  spaceKind.addEventListener('change', showSpaceExample)

  document.querySelector('#space-add')!.addEventListener('click', () => openSpaceDialog(null))
  document.querySelector('#space-cancel')!.addEventListener('click', () => spaceDialog.close())
  document.querySelector('#section-cancel')!.addEventListener('click', () => sectionDialog.close())
  sectionBack.addEventListener('click', closeSection)
  document.querySelector('#folder-back')!.addEventListener('click', closeFolder)
  document.querySelector('#folder-edit')!.addEventListener('click', () => {
    const space = getSpaces().find((item) => item.id === openSpaceId)
    if (space) openSpaceDialog(space)
  })
  folderAdd.addEventListener('click', () => {
    if (openSpaceId) openSectionDialog(null, openSpaceId)
  })
  document.querySelector('#folder-upload')!.addEventListener('click', () => {
    const space = getSpaces().find((item) => item.id === openSpaceId)
    folderMessage.hidden = true
    if (space) openSyllabusUpload(space)
  })
  setUpClassDialog()
  const addClasses = (space: Space | null | undefined) => {
    if (space && space.sections.length > 0) openClassDialog(space.sections)
  }
  document.querySelector('#folder-schedule-add')!.addEventListener('click', () => addClasses(getSpaces().find((item) => item.id === openSpaceId)))
  document.querySelector('#home-schedule-add')!.addEventListener('click', () => addClasses(findRecentSpace()))
  setUpSyllabusImport((message) => {
    folderMessage.textContent = message
    folderMessage.hidden = false
  })
  document.querySelector('#section-edit')!.addEventListener('click', () => {
    const found = findSection(openSectionId)
    if (found) openSectionDialog(found.section, found.space.id)
  })
  document.querySelector('#section-add-item')!.addEventListener('click', () => {
    if (openSectionId) openAgendaDialog(null, todayText(), openSectionId)
  })

  spaceForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const kind = spaceKind.value as SpaceKind
    const before = new Set(getSpaces().map((space) => space.id))
    const error = editingSpace
      ? await updateSpace(editingSpace.id, kind, spaceName.value)
      : await createSpace(kind, spaceName.value)
    // Una carpeta nueva se abre al tiro, para agregarle sus ramos
    const created = getSpaces().find((space) => !before.has(space.id))
    if (created) openFolder(created.id)
    if (error) {
      spaceError.textContent = error
      return
    }
    spaceDialog.close()
  })

  spaceArchive.addEventListener('click', async () => {
    if (!editingSpace) return
    const error = await archiveSpace(editingSpace.id, !editingSpace.archived)
    if (error) spaceError.textContent = error
    else spaceDialog.close()
  })

  spaceDelete.addEventListener('click', () =>
    confirmTwice(spaceDelete, 'Borrar', async () => {
      if (!editingSpace) return
      const error = await deleteSpace(editingSpace.id)
      if (error) spaceError.textContent = error
      else spaceDialog.close()
    }),
  )

  sectionForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const hours = readNumber(sectionGoal)
    const draft = {
      name: sectionName.value,
      color: chosenColor,
      code: sectionCode.value,
      teacher: sectionTeacher.value,
      place: sectionPlace.value,
      schedule: sectionSchedule.value,
      requirements: editingSection?.requirements ?? null, // el texto que trajo el programa se conserva, aunque ya no se edita
      weeklyGoalMinutes: sectionGoal.value && hours > 0 ? Math.round(hours * 60) : null,
      scale: {
        gradeMin: readNumber(gradeMinInput),
        gradeMax: readNumber(gradeMaxInput),
        gradePass: readNumber(gradePassInput),
        exigencia: readNumber(exigenciaInput),
      },
    }
    // Cada uno o la eximición necesitan evaluaciones a las que apuntar
    if (editingRules.some((rule) => rule.kind === 'each' && !rule.itemIds?.length)) {
      sectionError.textContent = 'Marca las evaluaciones de cada requisito de "cada una".'
      return
    }
    // Para eximirse se promedian las marcadas, o si no hay, todas las demás; pero hay que decir de qué
    if (editingRules.some((rule) => rule.kind === 'exempt' && !rule.itemIds?.length && !rule.exemptIds?.length)) {
      sectionError.textContent = 'En cada requisito de eximición, marca de qué te eximes o qué se promedia.'
      return
    }
    for (const rule of editingRules) {
      if (rule.kind !== 'exempt') rule.exemptIds = null
    }
    if (editingRules.some((rule) => !Number.isFinite(rule.min))) {
      sectionError.textContent = 'Escribe la nota de cada requisito.'
      return
    }
    let error = editingSection
      ? await updateSection(editingSection.id, draft)
      : await createSection(sectionSpaceId!, draft)
    if (!error && editingSection) {
      const found = findSection(editingSection.id)
      const rules = editingRules.map((rule) => ({ ...rule, label: rule.label.trim() || describeNewRule(found?.section ?? null, rule) }))
      error = await updateRules(editingSection.id, rules)
    }
    if (error) {
      sectionError.textContent = error
      return
    }
    sectionDialog.close()
  })

  document.querySelector('#section-rule-add')!.addEventListener('click', () => {
    const pass = readNumber(gradePassInput)
    editingRules.push({ id: '', kind: 'average', label: '', min: Number.isFinite(pass) ? pass : 4, itemIds: null })
    renderRuleEditors()
    rulesEditList.lastElementChild?.querySelector('select')?.focus()
  })

  sectionDelete.addEventListener('click', () =>
    confirmTwice(sectionDelete, 'Borrar', async () => {
      if (!editingSection) return
      const error = await deleteSection(editingSection.id)
      if (error) {
        sectionError.textContent = error
        return
      }
      sectionDialog.close()
      closeSection()
    }),
  )

  onSpacesChange(renderSpaces)
  onAgendaChange(() => {
    if (openSectionId) renderSection()
  })
}

// Al entrar a Carpetas desde el menú se parte en la lista
export function refreshSpacesPanel() {
  errorText.textContent = ''
  closeFolder()
  loadSpaces()
}
