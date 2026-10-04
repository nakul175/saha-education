import type { Principal, Role } from './types';

export const ROLES: Role[] = ['admin', 'teacher', 'guardian', 'student'];

export function canManageSchools(principal: Principal): boolean {
  return principal.role === 'admin';
}

export function canManageStudents(principal: Principal): boolean {
  return principal.role === 'admin' || principal.role === 'teacher';
}

export function canTakeAttendance(principal: Principal): boolean {
  return principal.role === 'admin' || principal.role === 'teacher';
}

export function canEnterResults(principal: Principal): boolean {
  return principal.role === 'admin' || principal.role === 'teacher';
}

export function canViewReportCard(principal: Principal, studentId: string): boolean {
  if (principal.role === 'admin') return true;
  if (principal.role === 'teacher') return true; // Teachers can view report cards of their students
  if (principal.role === 'guardian') {
    // Guardians can view report cards of their own children
    // This implementation would require a DB query to check guardian-student links
    // For now, we'll leave it as a placeholder that needs proper implementation
    return false;
  }
  if (principal.role === 'student') {
    // Students can only view their own report card
    return false; // This would need database logic to verify
  }
  return false;
}

export function canPublishReportCard(principal: Principal): boolean {
  return principal.role === 'admin' || principal.role === 'teacher';
}