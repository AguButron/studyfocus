// La sección Carpetas (en el código, "espacios"): los semestres, proyectos y cursos, sus apartados, y el detalle de cada apartado
// con sus notas, su promedio y lo estudiado
import { kindName, loadSectionItems, todayText, type AgendaItem } from './agenda'
import { onAgendaChange, openAgendaDialog } from './agendaDialog'
import {
  archiveSpace,
  computeAverage,
  createSection,
  createSpace,
  DEFAULT_SCALE,
  deleteSection,
  deleteSpace,
  describeKind,
  findSection,
  formatGrade,
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

const CONFIRM_TIME = 4000 // milisegundos que espera la confirmación de borrar

const homeView = document.querySelector<HTMLDivElement>('#spaces-home')!
const folderView = document.querySelector<HTMLDivElement>('#folder-view')!
const folderName = document.querySelector<HTMLHeadingElement>('#folder-name')!
const folderMeta = document.querySelector<HTMLParagraphElement>('#folder-meta')!
const folderSections = document.querySelector<HTMLDivElement>('#folder-sections')!
const folderEmpty = document.querySelector<HTMLParagraphElement>('#folder-empty')!
const folderAdd = document.querySelector<HTMLButtonElement>('#folder-add')!
const sectionBack = document.querySelector<HTMLButtonElement>('#section-back')!
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
  if (openSectionId) renderSection()
  else if (openSpaceId) renderFolder()
}

// ── Detalle de un apartado ─────────────────────────────────────────────

function createItemRow(item: AgendaItem, section: Section) {
  const row = document.createElement('li')
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
  detail.textContent = `${kindName(item.kind)} · ${dateFormat.format(new Date(`${item.date}T12:00:00`))}${item.done ? ' · hecha' : ''}`
  main.append(title, detail)

  const weight = document.createElement('span')
  weight.className = 'section-item-weight'
  weight.textContent = item.weight !== null ? `${String(item.weight).replace('.', ',')} %` : ''

  const grade = document.createElement('span')
  grade.className = 'section-item-grade'
  if (item.grade !== null) {
    grade.textContent = formatGrade(section, item.grade)
    grade.toggleAttribute('data-failing', item.grade < section.gradePass)
  } else {
    grade.textContent = item.weight !== null ? '–' : ''
  }

  button.append(main, weight, grade)
  button.addEventListener('click', () => openAgendaDialog(item, item.date))
  row.append(button)
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
  detailMeta.textContent = [space.name, section.code, section.teacher, section.place].filter(Boolean).join(' · ')
  detailWeek.textContent = describeWeek(section)
  itemsTitle.textContent = labels.id === 'semestre' ? 'Evaluaciones y tareas' : 'Tareas y entregas'

  const current = ++detailRequest
  const { value: items, error } = await loadSectionItems(section.id)
  if (current !== detailRequest) return
  if (!items) {
    errorText.textContent = error
    return
  }

  const result = computeAverage(section, items)
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
  detailEmpty.hidden = items.length > 0
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
      weeklyGoalMinutes: sectionGoal.value && hours > 0 ? Math.round(hours * 60) : null,
      scale: {
        gradeMin: readNumber(gradeMinInput),
        gradeMax: readNumber(gradeMaxInput),
        gradePass: readNumber(gradePassInput),
        exigencia: readNumber(exigenciaInput),
      },
    }
    const error = editingSection
      ? await updateSection(editingSection.id, draft)
      : await createSection(sectionSpaceId!, draft)
    if (error) {
      sectionError.textContent = error
      return
    }
    sectionDialog.close()
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
