// Subir los programas de los cursos en PDF: quedan en una cola, una IA los lee en el servidor de a uno,
// y la persona revisa cada ramo por separado (evaluaciones, fechas, porcentajes y requisitos).
// Recién al apretar "Crear ramo" se guarda en la carpeta, y se pasa al siguiente.
import { KINDS, type AgendaKind } from './agenda'
import { notifyAgendaChange } from './agendaDialog'
import { createInfoTip, describeRuleScope } from './infoTip'
import { DEFAULT_SCALE, describeKind, getSpaces, storeSpaces, type RuleKind, type Space } from './spaces'

type EvaluationKind = Exclude<AgendaKind, 'recordatorio'>

interface Evaluation {
  key: number // para que los requisitos sigan apuntando a ella aunque se borren otras
  kind: EvaluationKind
  title: string
  date: string | null
  time: string | null
  weight: number | null
}

interface DraftRule {
  kind: RuleKind
  label: string
  min: number
  evaluationKeys: number[] // vacío: el promedio final
  exemptKeys: number[] // solo al eximirse: de qué evaluaciones, como el examen
}

// Una sección del curso (sección 1, 2…), con su profesor, horario y sala
interface CourseSection {
  name: string
  teacher: string | null
  schedule: string | null
  place: string | null
}

interface DraftCourse {
  key: number
  file: string
  sections: CourseSection[]
  sectionChoice: number | null // la sección elegida; sus datos llenan profesor, horario y sala
  common: Pick<CourseSection, 'teacher' | 'schedule' | 'place'> // lo que es igual en todas las secciones
  sectionId: string | null // un ramo de la carpeta que ya existe y se completa
  name: string
  code: string | null
  teacher: string | null
  place: string | null
  schedule: string | null
  requirements: string | null
  scale: typeof DEFAULT_SCALE
  isScaleGuessed: boolean // el programa no la decía: se propone la de siempre
  evaluations: Evaluation[]
  rules: DraftRule[]
}

// Cada archivo en la cola y en qué va
type QueueState = 'waiting' | 'reading' | 'ready' | 'created' | 'skipped' | 'error'
interface QueueEntry {
  key: number
  file: File | null
  name: string
  state: QueueState
  message: string
  course: DraftCourse | null
}

const STATE_TEXT: Record<QueueState, string> = {
  waiting: 'En cola',
  reading: 'Leyendo…',
  ready: 'Para revisar',
  created: 'Creado',
  skipped: 'Descartado',
  error: 'No se pudo leer',
}

// Lo que responde el servidor al leer un programa
interface ReadCourse {
  sections: CourseSection[]
  name: string
  code: string | null
  teacher: string | null
  schedule: string | null
  place: string | null
  scale: typeof DEFAULT_SCALE | null
  requirements: string | null
  evaluations: Omit<Evaluation, 'key'>[]
  rules: { kind: RuleKind; label: string; min: number; evaluations: number[]; exempts?: number[] }[]
}

const EVALUATION_KINDS = KINDS.filter(({ id }) => id !== 'recordatorio')
const CONFIRM_TIME = 4000 // milisegundos que espera la confirmación de descartar

const dialog = document.querySelector<HTMLDialogElement>('#syllabus-dialog')!
const form = document.querySelector<HTMLFormElement>('#syllabus-form')!
const quotaText = document.querySelector<HTMLParagraphElement>('#syllabus-quota')!
const filesList = document.querySelector<HTMLUListElement>('#syllabus-files')!
const coursesBox = document.querySelector<HTMLDivElement>('#syllabus-courses')!
const errorText = document.querySelector<HTMLParagraphElement>('#syllabus-error')!
const createButton = document.querySelector<HTMLButtonElement>('#syllabus-create')!
const cancelButton = document.querySelector<HTMLButtonElement>('#syllabus-cancel')!
const skipButton = document.querySelector<HTMLButtonElement>('#syllabus-skip')!
const tabsBar = document.querySelector<HTMLDivElement>('#syllabus-tabs')!
const uploadPanel = document.querySelector<HTMLDivElement>('#syllabus-upload')!
const uploadStatus = document.querySelector<HTMLParagraphElement>('#syllabus-upload-status')!
const dropZone = document.querySelector<HTMLDivElement>('#syllabus-drop')!
const pickButton = document.querySelector<HTMLButtonElement>('#syllabus-pick')!
const fileInput = document.querySelector<HTMLInputElement>('#syllabus-input')!

let space: Space | null = null
let queue: QueueEntry[] = []
let currentKey: number | null = null // la pestaña abierta: un programa, o null para la de subida
const seen = new Set<number>() // las pestañas que ya se abrieron, para marcar las nuevas
let isProcessing = false
let totals = { sections: 0, completed: 0, items: 0 } // lo creado mientras estuvo abierta la ventana
let session = 0 // descarta respuestas de una revisión que ya se cerró
let nextKey = 1
let onCreated: (message: string) => void = () => {}

// ── Servidor ───────────────────────────────────────────────────────────

async function loadQuota(): Promise<number | null> {
  try {
    const response = await fetch('/api/programas/cupo')
    if (!response.ok) return null
    return ((await response.json()) as { remaining: number | null }).remaining // null: sin límite
  } catch {
    return null
  }
}

async function readFile(file: File): Promise<{ course: ReadCourse; remaining: number | null } | { error: string }> {
  try {
    const response = await fetch('/api/programas/leer', {
      method: 'POST',
      // El nombre ayuda a la IA a saber el año cuando el programa no lo dice
      headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
    })
    const result = await response.json()
    return response.ok ? result : { error: result.error ?? 'No se pudo leer.' }
  } catch {
    return { error: 'No se pudo conectar con el servidor.' }
  }
}

function showQuota(remaining: number | null) {
  quotaText.textContent =
    remaining === null ? '' : `Te quedan ${remaining} ${remaining === 1 ? 'programa' : 'programas'} por leer en las próximas 24 horas.`
}

// ── Estado ─────────────────────────────────────────────────────────────

// Un ramo de la carpeta con la misma sigla o el mismo nombre se completa en vez de duplicarse
function findExisting(course: Pick<ReadCourse, 'name' | 'code'>) {
  const same = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
  return space?.sections.find((section) => same(section.code, course.code) || same(section.name, course.name)) ?? null
}

function toDraft(course: ReadCourse, file: string): DraftCourse {
  const evaluations = course.evaluations.map((item) => ({ ...item, key: nextKey++ }))
  return {
    key: nextKey++,
    file,
    sectionId: findExisting(course)?.id ?? null,
    name: course.name,
    code: course.code,
    teacher: course.teacher,
    place: course.place,
    schedule: course.schedule,
    sections: course.sections ?? [],
    sectionChoice: null,
    common: { teacher: course.teacher, schedule: course.schedule, place: course.place },
    requirements: course.requirements,
    scale: course.scale ?? { ...DEFAULT_SCALE, exigencia: 50 }, // en los programas se asume 50 % de exigencia si no la dicen
    isScaleGuessed: course.scale === null,
    evaluations,
    rules: course.rules.map((rule) => ({
      kind: rule.kind,
      label: rule.label,
      min: rule.min,
      evaluationKeys: rule.evaluations.map((index) => evaluations[index]?.key).filter((key): key is number => key !== undefined),
      exemptKeys: (rule.exempts ?? []).map((index) => evaluations[index]?.key).filter((key): key is number => key !== undefined),
    })),
  }
}

function describeGroup(course: DraftCourse, rule: DraftRule) {
  const exempted = rule.exemptKeys.flatMap((key) => course.evaluations.filter((item) => item.key === key).map(({ title }) => title))
  if (rule.evaluationKeys.length === 0) return describeRuleScope(null, exempted)
  const counted = rule.evaluationKeys.flatMap((key) => course.evaluations.filter((item) => item.key === key).map(({ title, weight }) => ({ title, weight })))
  return describeRuleScope(counted, exempted)
}

function readNumber(value: string) {
  const number = Number(value.replace(',', '.'))
  return value.trim() === '' || !Number.isFinite(number) ? null : number
}

// ── Vista ──────────────────────────────────────────────────────────────

function input(value: string | number | null, onInput: (value: string) => void, options: Partial<HTMLInputElement> = {}) {
  const element = document.createElement('input')
  element.className = 'sf-input'
  Object.assign(element, options)
  element.value = value === null ? '' : String(value)
  element.addEventListener('input', () => onInput(element.value))
  return element
}

function field(label: string, control: HTMLElement, className = '') {
  const wrapper = document.createElement('label')
  wrapper.className = `sf-field ${className}`.trim()
  wrapper.append(label, control)
  return wrapper
}

function removeButton(label: string, onClick: () => void) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'sf-btn sf-btn--sm sf-btn--quiet syllabus-remove'
  button.textContent = '×'
  button.setAttribute('aria-label', label)
  button.title = label
  button.addEventListener('click', onClick)
  return button
}

function showWeightTotal(course: DraftCourse, element: HTMLElement) {
  const total = course.evaluations.reduce((sum, item) => sum + (item.weight ?? 0), 0)
  const rounded = Math.round(total * 100) / 100
  element.textContent = `Suman ${String(rounded).replace('.', ',')} %`
  // Un tercio repartido da 99,99 %: se acepta esa diferencia de redondeo
  const isOff = Math.abs(rounded - 100) > 0.1
  element.toggleAttribute('data-warning', isOff)
  element.title = isOff ? 'Lo normal es que sumen 100 %. Revisa los porcentajes.' : ''
}

function createEvaluationRow(course: DraftCourse, item: Evaluation, total: HTMLElement) {
  const row = document.createElement('li')
  row.className = 'syllabus-evaluation'

  const kind = document.createElement('select')
  kind.className = 'sf-input'
  kind.setAttribute('aria-label', 'Tipo')
  kind.append(...EVALUATION_KINDS.map(({ id, name }) => new Option(name, id)))
  kind.value = item.kind
  kind.addEventListener('change', () => (item.kind = kind.value as EvaluationKind))

  const title = input(item.title, (value) => (item.title = value), { maxLength: 100, required: true })
  title.setAttribute('aria-label', 'Nombre')

  const date = input(item.date, (value) => {
    item.date = value || null
    row.toggleAttribute('data-undated', !item.date)
  }, { type: 'date' })
  date.setAttribute('aria-label', 'Fecha')
  date.title = 'Vacía si aún no se sabe: queda en el ramo, fuera del calendario'
  row.toggleAttribute('data-undated', !item.date)

  const time = input(item.time, (value) => (item.time = value || null), { type: 'time' })
  time.setAttribute('aria-label', 'Hora')

  const weight = input(item.weight, (value) => {
    item.weight = readNumber(value)
    showWeightTotal(course, total)
  }, { type: 'number', min: '0', max: '100', step: 'any', placeholder: '%' })
  weight.setAttribute('aria-label', 'Porcentaje')

  row.append(
    kind,
    title,
    date,
    time,
    weight,
    removeButton(`Quitar ${item.title}`, () => {
      course.evaluations = course.evaluations.filter((other) => other !== item)
      render()
    }),
  )
  return row
}

function createRuleRow(course: DraftCourse, rule: DraftRule) {
  const row = document.createElement('li')
  row.className = 'syllabus-rule'
  const text = document.createElement('div')
  text.className = 'syllabus-rule-text'
  const label = input(rule.label, (value) => (rule.label = value), { maxLength: 120, required: true })
  label.setAttribute('aria-label', 'Requisito')
  // Qué cuenta para el requisito: aparece al pasar el mouse por el (i)
  text.append(label, createInfoTip('Qué cuenta para este requisito', describeGroup(course, rule), true))

  const min = input(rule.min, (value) => (rule.min = readNumber(value) ?? rule.min), { type: 'number', step: 'any' })
  min.setAttribute('aria-label', 'Nota mínima')
  min.title = 'Nota mínima'

  row.append(
    text,
    min,
    removeButton('Quitar este requisito', () => {
      course.rules = course.rules.filter((other) => other !== rule)
      render()
    }),
  )
  return row
}

function createCourseCard(course: DraftCourse) {
  const labels = describeKind(space?.kind ?? 'semestre')
  const card = document.createElement('article')
  card.className = 'syllabus-course sf-card'

  // Encabezado: de qué archivo viene, y si completa uno que ya existe
  const head = document.createElement('div')
  head.className = 'syllabus-course-head'
  const heading = document.createElement('h3')
  heading.textContent = `Revisa el ${labels.section.toLowerCase()}`
  const source = document.createElement('span')
  source.className = 'sf-row-detail'
  source.textContent = course.file
  head.append(heading, source)
  if (course.sectionId) {
    const badge = document.createElement('span')
    badge.className = 'sf-badge'
    badge.textContent = 'Ya existe: se completa'
    badge.title = 'Se le agregan las evaluaciones y los datos que le falten, sin duplicarlo.'
    head.append(badge)
  }
  card.append(head)

  // Si el curso tiene varias secciones, se elige la propia y se llenan solos el profesor, el horario y la sala
  if (course.sections.length > 1) {
    const choice = document.createElement('select')
    choice.className = 'sf-input'
    choice.append(
      new Option('Elige tu sección', ''),
      ...course.sections.map((section, index) => new Option([section.name, section.teacher].filter(Boolean).join(' · '), String(index))),
    )
    choice.value = course.sectionChoice === null ? '' : String(course.sectionChoice)
    choice.addEventListener('change', () => {
      course.sectionChoice = choice.value === '' ? null : Number(choice.value)
      const section = course.sectionChoice === null ? null : course.sections[course.sectionChoice]
      course.teacher = section?.teacher ?? course.common.teacher
      course.schedule = section?.schedule ?? course.common.schedule
      course.place = section?.place ?? course.common.place
      render()
    })
    const hint = document.createElement('span')
    hint.className = 'sf-field-hint'
    hint.textContent = `Este curso tiene ${course.sections.length} secciones: elige la tuya y se completan el profesor, el horario y la sala.`
    const sectionField = field('Tu sección', choice, 'syllabus-section-field')
    sectionField.append(hint)
    card.append(sectionField)
  }

  const main = document.createElement('div')
  main.className = 'syllabus-grid'
  main.append(
    field('Nombre', input(course.name, (value) => (course.name = value), { maxLength: 60, required: true }), 'syllabus-wide'),
    field('Sigla', input(course.code, (value) => (course.code = value || null), { maxLength: 20 })),
    field('Profesor', input(course.teacher, (value) => (course.teacher = value || null), { maxLength: 80 })),
    field('Sala', input(course.place, (value) => (course.place = value || null), { maxLength: 80 })),
    field('Horario', input(course.schedule, (value) => (course.schedule = value || null), { maxLength: 200 }), 'syllabus-wide'),
  )
  card.append(main)


  // La escala, solo al crear: uno que ya existe mantiene la suya
  if (!course.sectionId) {
    const scale = document.createElement('fieldset')
    scale.className = 'section-scale syllabus-scale'
    const legend = document.createElement('legend')
    legend.textContent = course.isScaleGuessed ? 'Escala de notas (el programa no la dice; revisa)' : 'Escala de notas'
    const scaleInput = (key: keyof typeof DEFAULT_SCALE) =>
      input(course.scale[key], (value) => (course.scale[key] = readNumber(value) ?? course.scale[key]), { type: 'number', step: 'any', required: true })
    scale.append(
      legend,
      field('Mínima', scaleInput('gradeMin')),
      field('Máxima', scaleInput('gradeMax')),
      field('Para aprobar', scaleInput('gradePass')),
      field('Exigencia (%)', scaleInput('exigencia')),
    )
    card.append(scale)
  }

  // Las evaluaciones
  const evaluationsHead = document.createElement('div')
  evaluationsHead.className = 'syllabus-section-head'
  const evaluationsTitle = document.createElement('h4')
  evaluationsTitle.textContent = 'Evaluaciones'
  const total = document.createElement('span')
  total.className = 'syllabus-total'
  showWeightTotal(course, total)
  evaluationsHead.append(evaluationsTitle, total)

  const columns = document.createElement('div')
  columns.className = 'syllabus-evaluation syllabus-columns sf-row-detail'
  columns.setAttribute('aria-hidden', 'true')
  for (const name of ['Tipo', 'Nombre', 'Fecha', 'Hora', '%', '']) {
    const cell = document.createElement('span')
    cell.textContent = name
    columns.append(cell)
  }

  const list = document.createElement('ul')
  list.className = 'syllabus-evaluations'
  list.append(...course.evaluations.map((item) => createEvaluationRow(course, item, total)))

  const add = document.createElement('button')
  add.type = 'button'
  add.className = 'sf-btn sf-btn--sm syllabus-add'
  add.textContent = '+ Agregar evaluación'
  add.addEventListener('click', () => {
    course.evaluations.push({ key: nextKey++, kind: 'prueba', title: '', date: null, time: null, weight: null })
    render()
    card.querySelector<HTMLInputElement>('.syllabus-evaluation:last-child input')?.focus()
  })

  const undated = course.evaluations.filter((item) => !item.date).length
  const hint = document.createElement('p')
  hint.className = 'sf-field-hint'
  hint.textContent = undated > 0 ? `${undated} sin fecha exacta: quedan en el ramo como "Sin fecha" y no aparecen en el calendario hasta que les pongas una.` : ''

  card.append(evaluationsHead, columns, list, add, hint)

  // Los requisitos, solo los que se revisan con las notas
  if (course.rules.length > 0) {
    const requirementsTitle = document.createElement('h4')
    requirementsTitle.textContent = 'Requisitos para aprobar'
    card.append(requirementsTitle)
    const rulesHint = document.createElement('p')
    rulesHint.className = 'sf-field-hint'
    rulesHint.textContent = 'Estos se revisan solos con tus notas: el ramo te dirá cuáles cumples.'
    const rules = document.createElement('ul')
    rules.className = 'syllabus-rules'
    rules.append(...course.rules.map((rule) => createRuleRow(course, rule)))
    card.append(rulesHint, rules)
  }
  return card
}

// ── La cola ────────────────────────────────────────────────────────────

const current = () => queue.find((entry) => entry.key === currentKey) ?? null

function createQueueRow(entry: QueueEntry, index: number) {
  const row = document.createElement('li')
  row.className = 'syllabus-queue-item'
  row.dataset.state = entry.state
  row.toggleAttribute('data-current', entry.key === currentKey)

  const button = document.createElement('button')
  button.type = 'button'
  button.disabled = entry.state !== 'ready' // solo se elige uno que espera revisión
  button.addEventListener('click', () => {
    currentKey = entry.key
    render()
  })
  const number = document.createElement('span')
  number.className = 'syllabus-queue-number'
  number.textContent = entry.state === 'created' ? '✓' : String(index + 1)
  const name = document.createElement('span')
  name.className = 'syllabus-queue-name'
  name.textContent = entry.course?.name ?? entry.name
  name.title = entry.name
  const status = document.createElement('span')
  status.className = 'syllabus-queue-status'
  status.textContent = entry.message || STATE_TEXT[entry.state]
  button.append(number, name, status)
  row.append(button)
  return row
}

// En la pestaña de subida, debajo de la cola: qué está pasando
function describeUpload() {
  const pending = queue.filter((entry) => entry.state === 'waiting' || entry.state === 'reading').length
  const ready = queue.filter((entry) => entry.state === 'ready').length
  const done = queue.filter((entry) => entry.state === 'created').length
  if (queue.length === 0) return ''
  if (ready > 0) return `${ready === 1 ? '1 programa espera' : `${ready} programas esperan`} tu revisión en su pestaña.`
  if (pending > 0) return 'Cada programa se abre en su propia pestaña apenas termina de leerse.'
  return done > 0 ? 'Listo: revisaste todos los programas. Puedes subir más o cerrar.' : 'No quedan programas por revisar.'
}

// Una pestaña por cada programa leído que falta revisar, y la de subida siempre primero
function createTab(label: string, key: number | null, isNew = false) {
  const tab = document.createElement('button')
  tab.type = 'button'
  tab.className = 'syllabus-tab'
  tab.setAttribute('role', 'tab')
  tab.setAttribute('aria-selected', String(key === currentKey))
  tab.toggleAttribute('data-new', isNew)
  const text = document.createElement('span')
  text.textContent = label
  tab.append(text)
  tab.addEventListener('click', () => {
    currentKey = key
    render()
  })
  return tab
}

function renderTabs() {
  const pending = queue.filter((entry) => entry.state === 'waiting' || entry.state === 'reading').length
  const uploadLabel = pending > 0 ? `Subir · leyendo ${pending}` : 'Subir'
  const ready = queue.filter((entry) => entry.state === 'ready' && entry.course)
  tabsBar.hidden = ready.length === 0
  tabsBar.replaceChildren(
    createTab(uploadLabel, null),
    ...ready.map((entry) => createTab(entry.course!.name, entry.key, !seen.has(entry.key))),
  )
}

// Al terminar con uno se pasa al siguiente que espera revisión, o a la pestaña de subida
function selectNext() {
  const next = queue.find((entry) => entry.state === 'ready')
  currentKey = next?.key ?? null
}

function render() {
  const entry = current()
  if (entry) seen.add(entry.key)
  // Puede que otro de la cola ya haya creado este mismo ramo: entonces se completa
  if (entry?.course && !entry.course.sectionId) entry.course.sectionId = findExisting(entry.course)?.id ?? null
  renderTabs()

  // Pestaña de subida: la zona para arrastrar y la cola. Pestaña de un programa: solo su configuración
  uploadPanel.hidden = !!entry
  filesList.replaceChildren(...queue.map(createQueueRow))
  uploadStatus.textContent = describeUpload()
  coursesBox.replaceChildren(...(entry?.course ? [createCourseCard(entry.course)] : []))
  dropZone.toggleAttribute('data-compact', queue.length > 0)

  const section = describeKind(space?.kind ?? 'semestre').section.toLowerCase()
  createButton.hidden = !entry
  skipButton.hidden = !entry
  createButton.disabled = !entry
  createButton.textContent = entry?.course?.sectionId ? `Completar ${section}` : `Añadir ${section}`
}

// ── Flujo ──────────────────────────────────────────────────────────────

async function readFiles(files: File[]) {
  const currentSession = session
  errorText.textContent = ''
  const pdfs = files.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
  for (const file of files.filter((item) => !pdfs.includes(item))) {
    queue.push({ key: nextKey++, file: null, name: file.name, state: 'error', message: 'No es un PDF', course: null })
  }

  // Lo que ya está en la cola también ocupa cupo
  const remaining = await loadQuota()
  if (currentSession !== session) return
  showQuota(remaining)
  const queued = queue.filter((entry) => entry.state === 'waiting' || entry.state === 'reading').length
  const room = remaining === null ? pdfs.length : Math.max(0, remaining - queued)
  pdfs.forEach((file, index) => {
    const allowed = index < room
    queue.push({
      key: nextKey++,
      file: allowed ? file : null,
      name: file.name,
      state: allowed ? 'waiting' : 'error',
      message: allowed ? '' : 'Sin cupo: podrás leerlo mañana',
      course: null,
    })
  })
  render()
  processQueue()
}

// Lee de a uno, en orden: la IA gratis tiene un límite de pedidos por minuto
async function processQueue() {
  if (isProcessing) return
  isProcessing = true
  const currentSession = session
  try {
    let entry: QueueEntry | undefined
    while ((entry = queue.find((item) => item.state === 'waiting'))) {
      entry.state = 'reading'
      render()
      const result = await readFile(entry.file!)
      if (currentSession !== session) return
      entry.file = null
      if ('error' in result) {
        entry.state = 'error'
        entry.message = result.error
      } else {
        entry.state = 'ready'
        entry.course = toDraft(result.course, entry.name)
        showQuota(result.remaining)
        // Se abre en su pestaña, salvo que ya se esté revisando otro: ahí queda marcada como nueva
        if (!current()) currentKey = entry.key
      }
      render()
    }
  } finally {
    if (currentSession === session) isProcessing = false
  }
}

// Abre la ventana vacía, con la zona para arrastrar o elegir los archivos
export async function openSyllabusUpload(target: Space) {
  space = target
  session++
  queue = []
  currentKey = null
  seen.clear()
  isProcessing = false
  totals = { sections: 0, completed: 0, items: 0 }
  errorText.textContent = ''
  quotaText.textContent = ''
  resetCancel()
  render()
  dialog.showModal()
  pickButton.focus()

  const currentSession = session
  const remaining = await loadQuota()
  if (currentSession === session) showQuota(remaining)
}

function start(files: File[]) {
  if (files.length > 0 && dialog.open) readFiles(files)
}

let cancelTimer = 0
function resetCancel() {
  clearTimeout(cancelTimer)
  cancelButton.classList.remove('sf-btn--danger')
  cancelButton.textContent = 'Cerrar'
}

// Lo que se manda: las evaluaciones en orden, y los requisitos apuntando a ellas por su posición
function toRequest(course: DraftCourse) {
  return {
    sectionId: course.sectionId,
    name: course.name,
    code: course.code,
    teacher: course.teacher,
    place: course.place,
    schedule: course.schedule,
    requirements: course.requirements,
    scale: course.scale,
    evaluations: course.evaluations.map(({ kind, title, date, time, weight }) => ({ kind, title, date, time, weight })),
    rules: course.rules.map((rule) => ({
      kind: rule.kind,
      label: rule.label,
      min: rule.min,
      evaluations: rule.evaluationKeys.map((key) => course.evaluations.findIndex((item) => item.key === key)).filter((index) => index >= 0),
      exempts: rule.exemptKeys.map((key) => course.evaluations.findIndex((item) => item.key === key)).filter((index) => index >= 0),
    })),
  }
}

// Crea solo el ramo en revisión y pasa al siguiente
async function create() {
  const entry = current()
  if (!space || !entry?.course) {
    errorText.textContent = 'Abre la carpeta donde quieres crear los ramos y vuelve a subirlos.'
    return
  }
  errorText.textContent = ''
  createButton.disabled = true
  try {
    const response = await fetch('/api/programas/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId: space.id, courses: [toRequest(entry.course)] }),
    })
    const result = await response.json()
    if (!response.ok) {
      errorText.textContent = result.error ?? 'No se pudo crear.'
      return
    }
    totals.sections += result.sections
    totals.completed += result.sections === 0 ? 1 : 0
    totals.items += result.items
    entry.state = 'created'
    entry.message = result.sections === 0 ? 'Completado' : 'Creado'
    storeSpaces(result)
    notifyAgendaChange()
    selectNext()
    coursesBox.scrollIntoView({ block: 'nearest' })
  } catch {
    errorText.textContent = 'No se pudo conectar con el servidor.'
  } finally {
    render()
  }
}

function skip() {
  const entry = current()
  if (!entry) return
  entry.state = 'skipped'
  entry.message = ''
  selectNext()
  render()
}

// Al cerrar, la carpeta dice cuánto se creó
function reportCreated() {
  if (!space || totals.sections + totals.completed === 0) return
  const labels = describeKind(space.kind)
  const sections = totals.sections === 1 ? `1 ${labels.section.toLowerCase()}` : `${totals.sections} ${labels.sections.toLowerCase()}`
  const items = `${totals.items} ${totals.items === 1 ? 'evaluación nueva' : 'evaluaciones nuevas'}`
  const parts = [
    totals.sections > 0 ? `creaste ${sections}` : '',
    totals.completed > 0 ? `completaste ${totals.completed === 1 ? '1 que ya existía' : `${totals.completed} que ya existían`}` : '',
  ].filter(Boolean)
  onCreated(`Listo: ${parts.join(' y ')}, con ${items} en total.`)
}

const hasPending = () => queue.some((entry) => ['waiting', 'reading', 'ready'].includes(entry.state))

export function setUpSyllabusImport(created: (message: string) => void) {
  onCreated = created
  fileInput.addEventListener('change', () => {
    start([...(fileInput.files ?? [])])
    fileInput.value = '' // así se puede elegir el mismo archivo de nuevo
  })
  pickButton.addEventListener('click', () => fileInput.click())
  dropZone.addEventListener('click', (event) => {
    if (event.target === dropZone) fileInput.click()
  })

  // Si se suelta fuera de la ventana, el navegador abriría el PDF y se perdería la revisión
  for (const type of ['dragover', 'drop'] as const) {
    window.addEventListener(type, (event) => {
      if (dialog.open && event.dataTransfer?.types.includes('Files')) event.preventDefault()
    })
  }

  // Arrastrar: sobre toda la ventana, para no tener que apuntar justo a la zona
  let dragDepth = 0
  dialog.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return
    event.preventDefault()
    dragDepth++
    dropZone.setAttribute('data-dragging', '')
  })
  dialog.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  })
  dialog.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) dropZone.removeAttribute('data-dragging')
  })
  dialog.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.files.length) return
    event.preventDefault()
    dragDepth = 0
    dropZone.removeAttribute('data-dragging')
    start([...event.dataTransfer.files])
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (form.reportValidity()) create()
  })

  skipButton.addEventListener('click', skip)

  // Cerrar descarta lo que falta por revisar: si queda algo, pide un segundo clic
  cancelButton.addEventListener('click', () => {
    if (hasPending() && !cancelButton.classList.contains('sf-btn--danger')) {
      cancelButton.classList.add('sf-btn--danger')
      cancelButton.textContent = '¿Descartar los que faltan?'
      cancelTimer = window.setTimeout(resetCancel, CONFIRM_TIME)
      return
    }
    dialog.close()
  })
  dialog.addEventListener('cancel', (event) => {
    if (hasPending()) event.preventDefault() // Escape no borra la revisión por accidente
  })
  dialog.addEventListener('close', () => {
    session++ // lo que aún se esté leyendo ya no se muestra
    isProcessing = false
    reportCreated()
  })
}

// La carpeta puede cambiar mientras está abierta la revisión: se busca de nuevo al crear
export function refreshSyllabusSpace() {
  if (space) space = getSpaces().find((item) => item.id === space!.id) ?? space
}
