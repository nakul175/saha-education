import type { Principal } from './types';

export const DEMO_USERS: Record<string, Principal> = {
  admin: { id: 'admin-001', role: 'admin', schoolId: 'school-001' },
  teacher: { id: 'teacher-001', role: 'teacher', schoolId: 'school-001' },
  guardian: { id: 'guardian-001', role: 'guardian', schoolId: 'school-001' },
  student: { id: 'student-001', role: 'student', schoolId: 'school-001' },
};

export function getPrincipal(request?: Request): Principal | null {
  if (!request) {
    return null;
  }
  
  const cookie = request.headers.get('Cookie');
  if (!cookie) {
    return null;
  }
  
  // Parse cookies to find saha_demo_role
  const cookies = cookie.split(';').map(c => c.trim());
  const demoRoleCookie = cookies.find(c => c.startsWith('saha_demo_role='));
  
  if (!demoRoleCookie) {
    return null;
  }
  
  const role = demoRoleCookie.split('=')[1];
  
  // Return the demo user for the role if it exists
  return DEMO_USERS[role] || null;
}

export function requirePrincipal(request?: Request): Principal {
  const principal = getPrincipal(request);
  if (!principal) {
    throw new Error('Authentication required');
  }
  return principal;
}

export function requireRole(principal: Principal, role: string): void {
  if (principal.role !== role) {
    throw new Error(`Role ${role} required`);
  }
}