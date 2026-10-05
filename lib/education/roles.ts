import type { Role } from './types';

export const ROLES: Role[] = ['admin', 'teacher', 'guardian', 'student'];

export function canRead(role: Role): boolean {
  return true; // All roles can read
}

export function canWrite(role: Role): boolean {
  return role !== 'student';
}

export function canDelete(role: Role): boolean {
  return role === 'admin';
}