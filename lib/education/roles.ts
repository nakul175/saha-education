export type Role = 'admin' | 'teacher' | 'guardian' | 'student';

export const ROLES: Role[] = ['admin', 'teacher', 'guardian', 'student'];

export function canManageSchools(principal: { role: Role }): boolean {
  return principal.role === 'admin';
}

export function canManageStudents(principal: { role: Role }): boolean {
  return principal.role === 'admin' || principal.role === 'teacher';
}

export function canTakeAttendance(principal: { role: Role }): boolean {
  return principal.role === 'admin' || principal.role === 'teacher';
}

export function canEnterResults(principal: { role: Role }): boolean {
  return principal.role === 'admin' || principal.role === 'teacher';
}

export function canViewReportCard(principal: { role: Role }, studentId: string): boolean {
  if (principal.role === 'admin') return true;
  if (principal.role === 'teacher') return true; // Teachers can view report cards of their students
  if (principal.role === 'guardian') {
    // Guardians can view report cards of their own children
    // This check would require additional logic to link guardians to students
    return false; // Placeholder for now
  }
  if (principal.role === 'student') {
    // Students can only view their own report card
    return false;
  }
  return false;
}

export function canPublishReportCard(principal: { role: Role }): boolean {
  return principal.role === 'admin' || principal.role === 'teacher';
}