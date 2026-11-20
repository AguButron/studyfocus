// Los roles del equipo y qué puede hacer cada uno en el panel de administración (admin.ts).
// El dueño se define en .env (OWNER_USERNAME): no se puede quitar desde la página. Los demás roles los
// asigna el dueño desde el panel, tras escribir la clave de roles (ROLES_PASSWORD).

export type Role = 'owner' | 'admin' | 'moderator' | 'analyst'
export const ASSIGNABLE_ROLES = ['admin', 'moderator', 'analyst'] as const

const OWNER_USERNAME = process.env.OWNER_USERNAME?.trim().toLowerCase() || null

export const PERMISSIONS = {
  metrics: ['owner', 'admin', 'analyst'],
  reports: ['owner', 'admin', 'moderator'],
  users: ['owner', 'admin', 'moderator'],
  warn: ['owner', 'admin', 'moderator'],
  mute: ['owner', 'admin', 'moderator'],
  suspend: ['owner', 'admin'],
  ban: ['owner', 'admin'],
  delete: ['owner', 'admin'],
  log: ['owner', 'admin'],
  roles: ['owner'],
} satisfies Record<string, Role[]>

export type Permission = keyof typeof PERMISSIONS

export function getRole(account: { username: string | null; role?: string | null }): Role | null {
  if (OWNER_USERNAME && account.username === OWNER_USERNAME) return 'owner'
  return ASSIGNABLE_ROLES.find((role) => role === account.role) ?? null
}

export function can(role: Role | null, permission: Permission) {
  return role !== null && (PERMISSIONS[permission] as Role[]).includes(role)
}

export function listPermissions(role: Role | null) {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((permission) => can(role, permission))
}
