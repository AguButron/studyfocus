// El panel de administración (server/src/admin.ts): métricas, reportes, usuarios con sus sanciones, el
// registro de lo que hace el equipo y los roles. Cada pestaña aparece solo si el rol tiene ese permiso.
import { callApi } from './api'
import { askConfirm } from './moreMenu'
import { formatDuration } from './stats'
import { LOCALE } from './i18n'

type Tab = 'metrics' | 'reports' | 'users' | 'log' | 'roles'
interface Person { id: string; name: string; username: string | null }
interface Report {
  id: string; reason: string; details: string | null; status: string; createdAt: string
  reporter: Person; reported: Person; reportedTotal: number; sanctions: number
}
interface User extends Person {
  role: string | null; createdAt: string; lastSeen: string | null; mutedUntil: string | null
  suspendedUntil: string | null; bannedAt: string | null; isGoogle: boolean; reportCount: number
}
interface UserDetail extends User {
  bio: string | null; studySeconds: number
  actions: { id: string; action: string; reason: string | null; until: string | null; createdAt: string; seenAt: string | null; actorName: string | null }[]
  reports: { id: string; reason: string; details: string | null; status: string; createdAt: string; reporter: Person }[]
}

const ROLE_NAMES: Record<string, string> = { owner: 'Dueño', admin: 'Admin', moderator: 'Moderador', analyst: 'Analista' }
const REASONS: Record<string, string> = {
  spam: 'Spam', abuse: 'Acoso u ofensas', inappropriate: 'Perfil inapropiado', cheating: 'Trampa con el tiempo', other: 'Otro',
}
const ACTIONS: Record<string, string> = {
  warning: 'Advertencia', mute: 'Silenciado', unmute: 'Silencio quitado', suspend: 'Suspendido', ban: 'Bloqueado',
  lift: 'Sanciones levantadas', report_resolved: 'Reporte resuelto', report_dismissed: 'Reporte descartado', role: 'Rol cambiado',
}
const STATUS_NAMES: Record<string, string> = { open: 'Abierto', resolved: 'Resuelto', dismissed: 'Descartado' }
const TAB_PERMISSION: Record<Tab, string> = { metrics: 'metrics', reports: 'reports', users: 'users', log: 'log', roles: 'roles' }

const navLink = document.querySelector<HTMLButtonElement>('.menu-nav button[data-panel="admin"]')!
const badge = document.querySelector<HTMLSpanElement>('#admin-badge')!
const roleText = document.querySelector<HTMLParagraphElement>('#admin-role')!
const tabButtons = document.querySelectorAll<HTMLButtonElement>('[data-admin-tab]')
const views = document.querySelectorAll<HTMLElement>('[data-admin-view]')
const errorText = document.querySelector<HTMLParagraphElement>('#admin-error')!
const metricsBox = document.querySelector<HTMLDivElement>('#admin-metrics')!
const reportsList = document.querySelector<HTMLUListElement>('#admin-reports')!
const reportsEmpty = document.querySelector<HTMLParagraphElement>('#admin-reports-empty')!
const statusButtons = document.querySelectorAll<HTMLButtonElement>('[data-report-status]')
const searchForm = document.querySelector<HTMLFormElement>('#admin-search')!
const searchInput = document.querySelector<HTMLInputElement>('#admin-search-input')!
const usersList = document.querySelector<HTMLUListElement>('#admin-users')!
const userBox = document.querySelector<HTMLDivElement>('#admin-user')!
const logList = document.querySelector<HTMLUListElement>('#admin-log')!
const unlockForm = document.querySelector<HTMLFormElement>('#admin-roles-unlock')!
const passwordInput = document.querySelector<HTMLInputElement>('#admin-roles-password')!
const rolesBox = document.querySelector<HTMLDivElement>('#admin-roles')!
const roleForm = document.querySelector<HTMLFormElement>('#admin-role-form')!
const roleUsername = document.querySelector<HTMLInputElement>('#admin-role-username')!
const roleSelect = document.querySelector<HTMLSelectElement>('#admin-role-select')!
const staffList = document.querySelector<HTMLUListElement>('#admin-staff')!
const sanctionDialog = document.querySelector<HTMLDialogElement>('#sanction-dialog')!
const sanctionForm = document.querySelector<HTMLFormElement>('#sanction-form')!
const sanctionTitle = document.querySelector<HTMLHeadingElement>('#sanction-title')!
const sanctionDaysField = document.querySelector<HTMLLabelElement>('#sanction-days-field')!
const sanctionDays = document.querySelector<HTMLSelectElement>('#sanction-days')!
const sanctionReason = document.querySelector<HTMLTextAreaElement>('#sanction-reason')!
const sanctionError = document.querySelector<HTMLParagraphElement>('#sanction-error')!
const sanctionConfirm = document.querySelector<HTMLButtonElement>('#sanction-confirm')!
const deleteDialog = document.querySelector<HTMLDialogElement>('#delete-user-dialog')!
const deleteForm = document.querySelector<HTMLFormElement>('#delete-user-form')!
const deleteTitle = document.querySelector<HTMLHeadingElement>('#delete-user-title')!
const deletePassword = document.querySelector<HTMLInputElement>('#delete-user-password')!
const deleteError = document.querySelector<HTMLParagraphElement>('#delete-user-error')!
const exportForm = document.querySelector<HTMLFormElement>('#admin-export')!
const exportFrom = document.querySelector<HTMLInputElement>('#admin-export-from')!
const exportTo = document.querySelector<HTMLInputElement>('#admin-export-to')!

const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' })
const numberFormat = new Intl.NumberFormat(LOCALE)

let permissions: string[] = []
let tab: Tab = 'metrics'
let reportStatus = 'open'
let openUserId: string | null = null
let sanction: { userId: string; kind: string; reportId: string | null } | null = null
let deleting: { id: string; name: string } | null = null

const can = (permission: string) => permissions.includes(permission)
const formatDate = (value: string | null) => (value ? dateFormat.format(new Date(value)) : '—')
const percent = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)} %` : '—')
const handle = (person: Person) => (person.username ? `@${person.username}` : `#${person.id}`)

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function button(label: string, action: () => void, className = 'sf-btn sf-btn--sm') {
  const node = element('button', className, label)
  node.type = 'button'
  node.addEventListener('click', action)
  return node
}

function showError(error: string | null) {
  errorText.textContent = error ?? ''
  return error === null
}

// ── Al entrar ──────────────────────────────────────────────────────────

// La cuenta dice qué puede hacer en el panel; sin permisos, el enlace del menú no aparece
export function setStaff(list: string[]) {
  permissions = list
  navLink.hidden = list.length === 0
  for (const tabButton of tabButtons) tabButton.hidden = !can(TAB_PERMISSION[tabButton.dataset.adminTab as Tab])
  if (can('reports')) refreshBadge()
}

async function refreshBadge() {
  const result = await callApi<{ reports: Report[] }>('/api/admin/reportes?estado=open')
  const open = result.value?.reports.length ?? 0
  badge.hidden = open === 0
  badge.textContent = String(open)
}

export async function refreshAdmin() {
  const me = await callApi<{ role: string; permissions: string[] }>('/api/admin/yo')
  if (!showError(me.error)) return
  roleText.textContent = `Tu rol: ${ROLE_NAMES[me.value!.role]}`
  setStaff(me.value!.permissions)
  if (!can(TAB_PERMISSION[tab])) tab = (Object.keys(TAB_PERMISSION) as Tab[]).find((option) => can(TAB_PERMISSION[option])) ?? 'metrics'
  showTab(tab)
}

function showTab(next: Tab) {
  tab = next
  showError(null)
  for (const tabButton of tabButtons) tabButton.setAttribute('aria-pressed', String(tabButton.dataset.adminTab === tab))
  for (const view of views) view.hidden = view.dataset.adminView !== tab
  if (tab === 'metrics') loadMetrics()
  else if (tab === 'reports') loadReports()
  else if (tab === 'users') searchUsers()
  else if (tab === 'log') loadLog()
  else loadRoles()
}

// ── Métricas ───────────────────────────────────────────────────────────

interface Metrics {
  live: { connected: number; inRooms: number; studying: number; openRooms: number }
  users: { total: number; new1: number; new7: number; new30: number; active1: number; active7: number; active30: number; activated: number }
  days: { date: string; newUsers: number; studiers: number; seconds: number }[]
  study: { total: string; week: string; weekStudiers: number }
  features: Record<string, number>
  retention: { week: string; size: number; w1: number; w2: number; w3: number; w4: number }[]
  reports: { open: number; week: number }
}

function card(label: string, value: string, detail = '') {
  const box = element('div', 'stat-card sf-card')
  box.append(element('span', 'stat-label', label), element('strong', '', value))
  if (detail) box.append(element('span', 'sf-row-detail', detail))
  return box
}

function section(title: string, ...children: HTMLElement[]) {
  const box = element('section', 'admin-section')
  box.append(element('h3', 'sf-section-title', title), ...children)
  return box
}

function cards(...items: HTMLElement[]) {
  const box = element('div', 'stat-cards')
  box.append(...items)
  return box
}

// Barras por día, con el valor al pasar el mouse y la primera y la última fecha abajo
function bars(title: string, days: Metrics['days'], value: (day: Metrics['days'][number]) => number, format: (value: number) => string) {
  const box = element('div', 'admin-chart sf-card')
  const max = Math.max(1, ...days.map(value))
  const total = days.reduce((sum, day) => sum + value(day), 0)
  const head = element('div', 'admin-chart-head')
  head.append(element('span', 'stat-label', title), element('strong', '', format(total)))
  const columns = element('div', 'admin-bars')
  columns.setAttribute('role', 'img')
  columns.setAttribute('aria-label', `${title}: ${format(total)} en 30 días`)
  for (const day of days) {
    const bar = element('span')
    bar.style.height = `${(value(day) / max) * 100}%`
    bar.title = `${dayFormat.format(new Date(`${day.date}T00:00:00Z`))}: ${format(value(day))}`
    columns.append(bar)
  }
  const axis = element('div', 'admin-chart-axis')
  axis.append(element('span', '', dayFormat.format(new Date(`${days[0].date}T00:00:00Z`))), element('span', '', 'Hoy'))
  box.append(head, columns, axis)
  return box
}

function table(headers: string[], rows: (string | number)[][]) {
  const box = element('div', 'admin-table-box sf-card')
  const node = element('table', 'admin-table')
  const head = element('tr')
  head.append(...headers.map((text) => element('th', '', text)))
  node.append(head, ...rows.map((row) => {
    const line = element('tr')
    line.append(...row.map((cell) => element('td', '', String(cell))))
    return line
  }))
  box.append(node)
  return box
}

async function loadMetrics() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const result = await callApi<Metrics>(`/api/admin/metricas?tz=${encodeURIComponent(timeZone)}`)
  if (!showError(result.error)) return
  const { live, users, days, study, features, retention, reports } = result.value!
  const n = (value: number) => numberFormat.format(value)
  const hours = (seconds: number) => formatDuration(seconds)
  const weekSeconds = Number(study.week)
  const today = Date.now()

  metricsBox.replaceChildren(
    section('Ahora', cards(card('Conectados', n(live.connected)), card('En salas', n(live.inRooms)), card('Estudiando', n(live.studying)), card('Salas abiertas', n(live.openRooms)))),
    section(
      'Usuarios',
      cards(
        card('Total', n(users.total), `+${n(users.new7)} en 7 días · +${n(users.new30)} en 30`),
        card('Activos hoy', n(users.active1), `${percent(users.active1, users.total)} del total`),
        card('Activos 7 días', n(users.active7), `${percent(users.active7, users.total)} del total`),
        card('Activos 30 días', n(users.active30), `Fidelidad ${percent(users.active1, users.active30)}`),
        card('Activación', percent(users.activated, users.total), `${n(users.activated)} estudiaron alguna vez`),
      ),
      bars('Nuevos por día', days, (day) => day.newUsers, n),
    ),
    section(
      'Estudio',
      cards(
        card('En total', hours(Number(study.total))),
        card('Últimos 7 días', hours(weekSeconds), `${n(study.weekStudiers)} personas`),
        card('Por persona', study.weekStudiers > 0 ? hours(weekSeconds / study.weekStudiers) : '—', 'Promedio en 7 días'),
      ),
      bars('Horas por día', days, (day) => day.seconds, hours),
      bars('Personas que estudiaron', days, (day) => day.studiers, n),
    ),
    section(
      'Uso de funciones',
      table(
        ['Función', 'Cantidad', 'Personas', '% de usuarios'],
        [
          ['Carpetas', n(features.spaces), n(features.spacesUsers), percent(features.spacesUsers, users.total)],
          ['Eventos', n(features.agenda), n(features.agendaUsers), percent(features.agendaUsers, users.total)],
          ['Objetivos', n(features.goals), n(features.goalsUsers), percent(features.goalsUsers, users.total)],
          ['Programas leídos', n(features.syllabus), n(features.syllabusUsers), percent(features.syllabusUsers, users.total)],
          ['Amistades', n(features.friendships), n(features.friendsUsers), percent(features.friendsUsers, users.total)],
          ['Mensajes (7 días)', n(features.messagesWeek), n(features.messagesUsers), percent(features.messagesUsers, users.total)],
        ],
      ),
    ),
    section(
      'Retención',
      element('p', 'sf-row-detail', 'De quienes se registraron cada semana, cuántos volvieron a estudiar 1, 2, 3 y 4 semanas después.'),
      table(
        ['Semana', 'Registros', 'Sem. 1', 'Sem. 2', 'Sem. 3', 'Sem. 4'],
        retention.map((row) => {
          const start = new Date(`${row.week}T00:00:00Z`).getTime()
          // Una semana que todavía no termina para toda la cohorte no tiene dato
          const cell = (weeks: number, value: number) => (start + (weeks + 1) * 7 * 86400000 > today ? '—' : percent(value, row.size))
          return [dayFormat.format(new Date(start)), n(row.size), cell(1, row.w1), cell(2, row.w2), cell(3, row.w3), cell(4, row.w4)]
        }),
      ),
    ),
    section('Moderación', cards(card('Reportes abiertos', n(reports.open)), card('Reportes en 7 días', n(reports.week)))),
  )
}

// ── Reportes ───────────────────────────────────────────────────────────

async function loadReports() {
  for (const statusButton of statusButtons) statusButton.setAttribute('aria-pressed', String(statusButton.dataset.reportStatus === reportStatus))
  const result = await callApi<{ reports: Report[] }>(`/api/admin/reportes?estado=${reportStatus}`)
  if (!showError(result.error)) return
  const reports = result.value!.reports
  reportsEmpty.hidden = reports.length > 0
  reportsList.replaceChildren(...reports.map(createReportRow))
  if (reportStatus === 'open') {
    badge.hidden = reports.length === 0
    badge.textContent = String(reports.length)
  }
}

function createReportRow(report: Report) {
  const row = element('li', 'admin-row sf-card')
  const head = element('div', 'admin-row-head')
  head.append(
    element('strong', '', `${report.reported.name} ${handle(report.reported)}`),
    element('span', 'sf-badge', REASONS[report.reason] ?? report.reason),
    element('span', 'sf-row-detail', dateTimeFormat.format(new Date(report.createdAt))),
  )
  row.append(head)
  if (report.details) row.append(element('p', 'admin-quote', report.details))
  row.append(element('span', 'sf-row-detail', `Lo reportó ${report.reporter.name} ${handle(report.reporter)} · ${report.reportedTotal} ${report.reportedTotal === 1 ? 'reporte' : 'reportes'} · ${report.sanctions} ${report.sanctions === 1 ? 'sanción' : 'sanciones'}`))
  const actions = element('div', 'admin-actions')
  actions.append(button('Ver usuario', () => openUser(report.reported.id)))
  if (report.status === 'open') {
    const person = { id: report.reported.id, name: report.reported.name }
    if (can('warn')) actions.append(button('Advertir', () => openSanction(person, 'warning', report.id)))
    if (can('mute')) actions.append(button('Silenciar', () => openSanction(person, 'mute', report.id)))
    if (can('suspend')) actions.append(button('Suspender', () => openSanction(person, 'suspend', report.id)))
    actions.append(button('Descartar', async () => {
      const result = await callApi('/api/admin/reportes/cerrar', { id: report.id, status: 'dismissed' })
      if (showError(result.error)) loadReports()
    }))
  } else {
    actions.append(element('span', 'sf-row-detail', STATUS_NAMES[report.status]))
  }
  row.append(actions)
  return row
}

// ── Usuarios ───────────────────────────────────────────────────────────

function describeState(user: User) {
  const now = Date.now()
  if (user.bannedAt) return 'Bloqueado'
  if (user.suspendedUntil && Date.parse(user.suspendedUntil) > now) return `Suspendido hasta ${formatDate(user.suspendedUntil)}`
  if (user.mutedUntil && Date.parse(user.mutedUntil) > now) return `Silenciado hasta ${formatDate(user.mutedUntil)}`
  return null
}

async function searchUsers() {
  const result = await callApi<{ users: User[] }>(`/api/admin/usuarios?q=${encodeURIComponent(searchInput.value)}`)
  if (!showError(result.error)) return
  usersList.replaceChildren(...result.value!.users.map((user) => {
    const row = element('li')
    const open = button('', () => openUser(user.id), 'admin-user-row')
    open.toggleAttribute('data-active', user.id === openUserId)
    const name = element('span', 'admin-user-name')
    name.append(element('strong', '', user.name), element('span', 'sf-row-detail', handle(user)))
    open.append(name)
    const state = describeState(user)
    if (user.role) open.append(element('span', 'sf-badge', ROLE_NAMES[user.role]))
    if (state) open.append(element('span', 'sf-badge admin-badge-danger', state.split(' ')[0]))
    if (user.reportCount > 0) open.append(element('span', 'sf-row-detail', `${user.reportCount} rep.`))
    row.append(open)
    return row
  }))
}

async function openUser(id: string) {
  if (tab !== 'users') {
    tab = 'users'
    for (const tabButton of tabButtons) tabButton.setAttribute('aria-pressed', String(tabButton.dataset.adminTab === 'users'))
    for (const view of views) view.hidden = view.dataset.adminView !== 'users'
    searchUsers()
  }
  openUserId = id
  const result = await callApi<UserDetail>(`/api/admin/usuario?id=${id}`)
  if (!showError(result.error)) return
  const user = result.value!
  const state = describeState(user)
  const head = element('div', 'admin-row-head')
  head.append(element('h3', '', user.name), element('span', 'sf-row-detail', handle(user)))
  if (user.role) head.append(element('span', 'sf-badge', ROLE_NAMES[user.role]))
  const facts = element('dl', 'admin-facts')
  const fact = (label: string, value: string) => {
    const pair = element('div')
    pair.append(element('dt', '', label), element('dd', '', value))
    facts.append(pair)
  }
  fact('ID', user.id)
  fact('Cuenta', user.isGoogle ? 'Google' : 'Correo')
  fact('Registro', formatDate(user.createdAt))
  fact('Última vez', formatDate(user.lastSeen))
  fact('Estudió', formatDuration(user.studySeconds))
  fact('Estado', state ?? 'Sin sanciones')
  const actions = element('div', 'admin-actions')
  const person = { id: user.id, name: user.name }
  const isMuted = Boolean(user.mutedUntil && Date.parse(user.mutedUntil) > Date.now())
  if (can('warn')) actions.append(button('Advertir', () => openSanction(person, 'warning', null)))
  if (can('mute')) actions.append(isMuted ? button('Quitar silencio', () => quickSanction(person, 'unmute')) : button('Silenciar', () => openSanction(person, 'mute', null)))
  if (can('suspend')) actions.append(button('Suspender', () => openSanction(person, 'suspend', null)))
  if (can('ban') && !user.bannedAt) actions.append(button('Bloquear', () => openSanction(person, 'ban', null), 'sf-btn sf-btn--sm sf-btn--danger'))
  if (can('suspend') && state) actions.append(button('Levantar sanciones', () => quickSanction(person, 'lift')))
  if (can('delete')) actions.append(button('Borrar cuenta', () => openDelete(person), 'sf-btn sf-btn--sm sf-btn--danger'))
  if (user.username) {
    const profile = element('a', 'sf-btn sf-btn--sm sf-btn--quiet', 'Ver perfil')
    profile.href = `/perfil/${encodeURIComponent(user.username)}`
    profile.target = '_blank'
    actions.append(profile)
  }
  const history = element('ul', 'admin-history')
  history.append(...user.actions.map((action) => {
    const item = element('li')
    const until = action.until ? ` hasta ${formatDate(action.until)}` : ''
    const seen = action.action === 'warning' ? (action.seenAt ? ' · vista' : ' · sin ver') : ''
    item.append(element('strong', '', `${ACTIONS[action.action] ?? action.action}${until}`), element('span', 'sf-row-detail', ` · ${dateTimeFormat.format(new Date(action.createdAt))} · ${action.actorName ?? '—'}${seen}`))
    if (action.reason) item.append(element('p', 'admin-quote', action.action === 'role' ? ROLE_NAMES[action.reason] ?? 'Sin rol' : action.reason))
    return item
  }))
  const reports = element('ul', 'admin-history')
  reports.append(...user.reports.map((report) => {
    const item = element('li')
    item.append(element('strong', '', REASONS[report.reason] ?? report.reason), element('span', 'sf-row-detail', ` · ${STATUS_NAMES[report.status]} · ${dateTimeFormat.format(new Date(report.createdAt))} · ${report.reporter.name}`))
    if (report.details) item.append(element('p', 'admin-quote', report.details))
    return item
  }))
  userBox.replaceChildren(
    head,
    ...(user.bio ? [element('p', 'admin-quote', user.bio)] : []),
    facts,
    actions,
    element('h4', 'sf-section-title', 'Historial'),
    user.actions.length > 0 ? history : element('p', 'sf-row-detail', 'Sin acciones'),
    element('h4', 'sf-section-title', 'Reportes recibidos'),
    user.reports.length > 0 ? reports : element('p', 'sf-row-detail', 'Sin reportes'),
  )
  userBox.hidden = false
}

// ── Sanciones ──────────────────────────────────────────────────────────

const SANCTION_TITLES: Record<string, [string, string]> = {
  warning: ['Advertir a {}', 'Advertir'],
  mute: ['Silenciar a {}', 'Silenciar'],
  suspend: ['Suspender a {}', 'Suspender'],
  ban: ['Bloquear a {}', 'Bloquear'],
}

function openSanction(person: { id: string; name: string }, kind: string, reportId: string | null) {
  sanction = { userId: person.id, kind, reportId }
  const [titleText, action] = SANCTION_TITLES[kind]
  sanctionTitle.textContent = titleText.replace('{}', person.name)
  sanctionConfirm.textContent = action
  sanctionDaysField.hidden = kind !== 'mute' && kind !== 'suspend'
  sanctionForm.reset()
  sanctionError.textContent = ''
  sanctionDialog.showModal()
}

async function quickSanction(person: { id: string; name: string }, kind: 'unmute' | 'lift') {
  const title = kind === 'unmute' ? `¿Quitar el silencio a ${person.name}?` : `¿Levantar las sanciones de ${person.name}?`
  if (!(await askConfirm(title, 'Confirmar'))) return
  const result = await callApi('/api/admin/sancion', { userId: person.id, kind })
  if (showError(result.error)) refreshUser(person.id)
}

// Tras una sanción: la ficha y la lista, que muestra el estado
function refreshUser(id: string) {
  openUser(id)
  if (tab === 'users') searchUsers()
}

sanctionForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!sanction) return
  const days = Number(sanctionDays.value)
  const result = await callApi('/api/admin/sancion', { ...sanction, reason: sanctionReason.value, days })
  if (result.error) {
    sanctionError.textContent = result.error
    return
  }
  sanctionDialog.close()
  const { userId, reportId } = sanction
  if (reportId) loadReports()
  if (tab === 'users' || openUserId === userId) refreshUser(userId)
})
document.querySelector('#sanction-cancel')!.addEventListener('click', () => sanctionDialog.close())

// ── Borrar una cuenta ──────────────────────────────────────────────────

function openDelete(person: { id: string; name: string }) {
  deleting = person
  deleteTitle.textContent = `¿Borrar la cuenta de ${person.name}?`
  deleteForm.reset()
  deleteError.textContent = ''
  deleteDialog.showModal()
}

deleteForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!deleting) return
  const result = await callApi('/api/admin/usuario/borrar', { userId: deleting.id, password: deletePassword.value })
  deletePassword.value = ''
  if (result.error) {
    deleteError.textContent = result.error
    return
  }
  deleteDialog.close()
  openUserId = null
  userBox.hidden = true
  searchUsers()
})
document.querySelector('#delete-user-cancel')!.addEventListener('click', () => deleteDialog.close())

// ── Exportar ───────────────────────────────────────────────────────────

const dateText = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// Por defecto, los últimos 30 días
exportTo.value = dateText(new Date())
exportFrom.value = dateText(new Date(Date.now() - 29 * 86400000))

exportForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const params = new URLSearchParams({ desde: exportFrom.value, hasta: exportTo.value, tz: timeZone })
  const result = await callApi<{ days: (Metrics['days'][number] & Record<string, number | string>)[] }>(`/api/admin/exportar?${params}`)
  if (!showError(result.error)) return
  // En español, Excel separa las columnas con ; y los decimales con coma
  const isSpanish = LOCALE.startsWith('es')
  const separator = isSpanish ? ';' : ','
  const hours = (seconds: number) => (seconds / 3600).toFixed(2).replace('.', isSpanish ? ',' : '.')
  const header = isSpanish
    ? ['Fecha', 'Usuarios nuevos', 'Personas que estudiaron', 'Horas estudiadas', 'Carpetas creadas', 'Eventos creados', 'Objetivos creados', 'Programas leídos', 'Mensajes enviados', 'Reportes']
    : ['Date', 'New users', 'People who studied', 'Hours studied', 'Folders created', 'Events created', 'Goals created', 'Syllabi read', 'Messages sent', 'Reports']
  const lines = result.value!.days.map((day) =>
    [day.date, day.newUsers, day.studiers, hours(day.seconds), day.spaces, day.agenda, day.goals, day.syllabus, day.messages, day.reports].join(separator),
  )
  // El BOM al principio hace que Excel lea bien las tildes
  const blob = new Blob(['\ufeff' + [header.join(separator), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const link = element('a')
  link.href = URL.createObjectURL(blob)
  link.download = `studyfocus-${exportFrom.value}-a-${exportTo.value}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000) // después de que empiece la descarga
})

// ── Registro ───────────────────────────────────────────────────────────

async function loadLog() {
  const result = await callApi<{ actions: { id: string; action: string; reason: string | null; until: string | null; createdAt: string; actor: Person | null; target: Person | null }[] }>('/api/admin/registro')
  if (!showError(result.error)) return
  logList.replaceChildren(...result.value!.actions.map((action) => {
    const row = element('li', 'admin-log-row')
    const what = `${ACTIONS[action.action] ?? action.action}${action.until ? ` hasta ${formatDate(action.until)}` : ''}`
    row.append(
      element('span', 'sf-row-detail', dateTimeFormat.format(new Date(action.createdAt))),
      element('strong', '', what),
      element('span', '', `${action.target ? `${action.target.name} ${handle(action.target)}` : '—'} · por ${action.actor?.name ?? '—'}`),
    )
    if (action.reason) row.append(element('span', 'admin-quote', action.action === 'role' ? ROLE_NAMES[action.reason] ?? 'Sin rol' : action.reason))
    return row
  }))
}

// ── Roles ──────────────────────────────────────────────────────────────

async function loadRoles() {
  const result = await callApi<{ staff: User[] }>('/api/admin/roles')
  const locked = result.error !== null
  unlockForm.hidden = !locked
  rolesBox.hidden = locked
  if (locked) {
    passwordInput.focus()
    return
  }
  renderStaff(result.value!.staff)
}

function renderStaff(staff: User[]) {
  staffList.replaceChildren(...staff.map((user) => {
    const row = element('li', 'admin-row sf-card admin-staff-row')
    const name = element('span', 'admin-user-name')
    name.append(element('strong', '', user.name), element('span', 'sf-row-detail', handle(user)))
    const select = element('select', 'sf-input')
    select.setAttribute('aria-label', `Rol de ${user.name}`)
    for (const role of ['admin', 'moderator', 'analyst']) select.append(new Option(ROLE_NAMES[role], role, false, role === user.role))
    select.addEventListener('change', () => changeRole(user.username!, select.value))
    row.append(name, select, button('Quitar', async () => {
      if (await askConfirm(`¿Quitarle el rol a ${user.name}?`, 'Quitar')) changeRole(user.username!, null)
    }))
    return row
  }))
}

async function changeRole(username: string, role: string | null) {
  const result = await callApi<{ staff: User[] }>('/api/admin/roles', { username, role })
  if (showError(result.error)) renderStaff(result.value!.staff)
  else if (result.error === 'Escribe la clave de roles.') loadRoles()
}

// ── Eventos ────────────────────────────────────────────────────────────

for (const tabButton of tabButtons) tabButton.addEventListener('click', () => showTab(tabButton.dataset.adminTab as Tab))
for (const statusButton of statusButtons) {
  statusButton.addEventListener('click', () => {
    reportStatus = statusButton.dataset.reportStatus!
    loadReports()
  })
}
searchForm.addEventListener('submit', (event) => {
  event.preventDefault()
  searchUsers()
})
unlockForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const result = await callApi('/api/admin/roles/clave', { password: passwordInput.value })
  passwordInput.value = ''
  if (showError(result.error)) loadRoles()
})
roleForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  await changeRole(roleUsername.value.trim().replace(/^@/, '').toLowerCase(), roleSelect.value)
  if (!errorText.textContent) roleUsername.value = ''
})
