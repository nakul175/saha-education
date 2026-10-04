import { type Principal } from './types';
import { ROLES, Role } from './roles';

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
      userId: `demo-user-${demoRole}`,
      displayName: `Demo ${demoRole}`,
      email: `${demoRole}@example.com`,
      fullName: `Demo ${demoRole}`,
      provider: 'sites-chatgpt',
      role: demoRole,
    };
  }

  // Optionally, we might check for a cookie to determine the role
  // const cookie = request.headers.get('cookie');
  // if (cookie) {
  //   // Parse cookie and extract role information
  // }

  return null;
}

// Helper to require a specific role - throws a typed error if not authorized
export function requireRole(principal: SessionPrincipal | null, roles: Role[]): void {
  if (!principal || !roles.includes(principal.role)) {
    throw new Error(`Unauthorized: required one of [${roles.join(', ')}], got ${principal?.role || 'none'}`);
  }
}