import type { User } from '../types'

export type UserType = 'admin' | 'staff'

export type Permission =
  | 'manageUsers'
  | 'manageSettings'
  | 'manageCa'
  | 'manageLedger'
  | 'manageClients'
  | 'manageFs'

const PERMISSIONS: Record<Permission, UserType[]> = {
  manageUsers: ['admin'],
  manageSettings: ['admin'],
  manageCa: ['admin'],
  manageLedger: ['admin'],
  manageClients: ['admin', 'staff'],
  manageFs: ['admin', 'staff'],
}

export function normalizeUserType(value?: string | null): UserType {
  return value === 'admin' ? 'admin' : 'staff'
}

export function isAdmin(user?: Pick<User, 'userType'> | null): boolean {
  return normalizeUserType(user?.userType) === 'admin'
}

export function hasPermission(
  user: Pick<User, 'userType'> | null | undefined,
  permission: Permission,
): boolean {
  const allowed = PERMISSIONS[permission] || []
  return allowed.includes(normalizeUserType(user?.userType))
}

export function getUserTypeLabel(userType?: string | null): string {
  return normalizeUserType(userType) === 'admin' ? 'Admin' : 'Staff'
}
