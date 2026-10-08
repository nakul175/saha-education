import { and, eq, gt, lt } from 'drizzle-orm';
import { getDb } from '@/db';
import { authSessions, users } from '@/db/schema';
import { cookie, digest, randomToken, secureCookie } from './identity';
import { DEMO_ISSUER } from './demo-policy';
import { sessionExecutionScope, verifiedSessionPrincipal } from './principal-authority';
import type { Principal, Role } from './types';

export const SESSION_COOKIE = '__Host-saha_session';
export const SESSION_SECONDS = 8 * 60 * 60;
const roles = new Set<Role>(['admin', 'teacher', 'guardian', 'student']);

export async function principalForToken(token: string | null): Promise<Principal | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const db = getDb();
  const tokenHash = await digest(token);
  const [row] = await db
    .select({ user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, Date.now())))
    .limit(1);
  const user = row?.user;
  if (
    !user ||
    user.disabledAt ||
    !user.schoolId ||
    !user.identityIssuer ||
    !user.identitySubject ||
    !roles.has(user.role as Role)
  )
    return null;
  const principal = verifiedSessionPrincipal(
    {
      id: user.id,
      role: user.role as Role,
      schoolId: user.schoolId,
      identityIssuer: user.identityIssuer,
      identitySubject: user.identitySubject,
    },
    tokenHash,
  );
  if (user.identityIssuer === DEMO_ISSUER) {
    // Synthetic sign-in is separately installed. The second statement checks
    // its installation marker together with the exact opaque session; ordinary
    // provider accounts keep their existing single-query resolution path.
    const [allowed] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, user.id), sessionExecutionScope(principal)))
      .limit(1);
    if (!allowed) return null;
  }
  return principal;
}

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const token = randomToken();
  const now = Date.now();
  await db.delete(authSessions).where(lt(authSessions.expiresAt, now));
  await db.insert(authSessions).values({
    tokenHash: await digest(token),
    userId,
    createdAt: now,
    expiresAt: now + SESSION_SECONDS * 1000,
  });
  return secureCookie(SESSION_COOKIE, token, SESSION_SECONDS);
}

export async function revokeSession(request: Request): Promise<void> {
  const token = cookie(request, SESSION_COOKIE);
  if (token)
    await getDb()
      .delete(authSessions)
      .where(eq(authSessions.tokenHash, await digest(token)));
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await getDb().delete(authSessions).where(eq(authSessions.userId, userId));
}
