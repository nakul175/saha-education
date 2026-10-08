import type { Role } from './types';

export const ROLES: Role[] = ['admin', 'teacher', 'guardian', 'student'];
// These helpers control presentation only. Services enforce record authorization.
export function canRead(role: Role): boolean {
  return ROLES.includes(role);
}
export function canWrite(role: Role): boolean {
  return role === 'admin' || role === 'teacher';
}
export function canDelete(role: Role): boolean {
  return role === 'admin';
}
