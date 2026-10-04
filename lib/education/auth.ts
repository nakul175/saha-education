import { type Principal, type Role } from './types';
import { ROLES } from './roles';

// Type for the session principal in our system
export type SessionPrincipal = Principal & {
  role: Role;
  userId: string;
};

// Helper to determine if a principal is authenticated
export function isAuthenticated(principal: SessionPrincipal | null): boolean {
  return principal !== null && !!principal.userId;
}

// Helper to get the currently signed-in user from request headers (adapted from saha/identity.ts)
// In development, we use a demo user selected via cookie or header
export function getPrincipal(request: Request): SessionPrincipal | null {
  // Attempt to read the principal from headers (production case)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    // In a real implementation, we would decode the token and validate it here
    // For now, this is a placeholder for what would be implemented in the actual system
    return null;
  }

  // Fallback to dev-mode demo user
  const demoRole = request.headers.get('x-demo-role') as Role | null;
  if (demoRole && ROLES.includes(demoRole)) {
    // In a real implementation, we would use a more robust way to identify user
    return {
      id: `demo-user-${demoRole}`,
      name: `Demo ${demoRole}`,
      email: `${demoRole}@example.com`,
      role: demoRole,
      schoolId: null,
      userId: `demo-user-${demoRole}`,
    };
  }

  // Optionally, we might check for a cookie to determine the role
  // const cookie = request.headers.get('cookie');
  // if (cookie) {
  //   // Parse cookie and extract role information
  // }

  return null;
}

// Demo users for each role
export const DEMO_USERS: Record<Role, Principal> = {
  admin: {
    id: 'demo-user-admin',
    name: 'Demo Admin',
    email: 'admin@example.com',
    role: 'admin',
    schoolId: null,
  },
  teacher: {
    id: 'demo-user-teacher',
    name: 'Demo Teacher',
    email: 'teacher@example.com',
    role: 'teacher',
    schoolId: null,
  },
  guardian: {
    id: 'demo-user-guardian',
    name: 'Demo Guardian',
    email: 'guardian@example.com',
    role: 'guardian',
    schoolId: null,
  },
  student: {
    id: 'demo-user-student',
    name: 'Demo Student',
    email: 'student@example.com',
    role: 'student',
    schoolId: null,
  },
};

// Error classes for authentication/authorization
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
    Object.setPrototypeOf(this, AuthError.prototype);
  }
  status = 401;
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
  status = 403;
}

// Helper to require a specific role - throws a typed error if not authorized
export function requireRole(principal: SessionPrincipal | null, roles: Role[]): void {
  if (!principal) {
    throw new AuthError(`Unauthorized: required one of [${roles.join(', ')}]`);
  }
  if (!roles.includes(principal.role)) {
    throw new ForbiddenError(`Forbidden: required one of [${roles.join(', ')}], got ${principal.role}`);
  }
}