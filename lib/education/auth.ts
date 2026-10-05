import { cookies } from 'next/headers';
import { cookie, AuthError } from './identity';
import { principalForToken, SESSION_COOKIE } from './session';
import type { Principal } from './types';
export { AuthError, authFailure, requireSameOrigin } from './identity';

export async function getPrincipal(request?: Request): Promise<Principal | null> {
  if (!request) return null;
  // Legacy role cookies and identity headers confer no authority.
  return principalForToken(cookie(request, SESSION_COOKIE));
}

export async function getServerPrincipal(): Promise<Principal | null> {
  const jar = await cookies();
  const values = jar.getAll(SESSION_COOKIE);
  return principalForToken(values.length === 1 ? values[0].value : null);
}

export async function requirePrincipal(request?: Request): Promise<Principal> {
  const principal = await getPrincipal(request);
  if (!principal) throw new AuthError('Authentication required', 401);
  return principal;
}

export function requireRole(principal: Principal, role: string): void {
  if (principal.role !== role) throw new AuthError('Permission denied', 403);
}
