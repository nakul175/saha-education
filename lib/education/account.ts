import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { authSessions, schools, users } from '@/db/schema';
import { livePrincipalScope } from './access';
import { DEMO_ISSUER } from './demo-policy';
import { cookie, digest } from './identity';
import { SESSION_COOKIE } from './session';
import type { Principal, Role } from './types';

export type AccountSummary = {
  name: string;
  email: string;
  role: Role;
  schoolName: string;
  /** school: trusted provider; synthetic_demo: separately installed fictional entry. */
  signInMethod: 'school' | 'synthetic_demo';
  sessionExpiresAt: string;
};

/** The signed-in person's own account only. Provider issuer/subject and other
 * accounts are never returned; the session row is selected by the request's own
 * opaque token and re-checked with the same live scope as protected data. */
export async function getAccountSummary(
  request: Request,
  principal: Principal,
): Promise<AccountSummary | null> {
  const token = cookie(request, SESSION_COOKIE);
  if (!token) return null;
  const [row] = await getDb()
    .select({
      name: users.name,
      email: users.email,
      role: users.role,
      issuer: users.identityIssuer,
      schoolName: schools.name,
      expiresAt: authSessions.expiresAt,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .innerJoin(schools, eq(schools.id, users.schoolId))
    .where(
      and(
        eq(authSessions.tokenHash, await digest(token)),
        eq(users.id, principal.id),
        livePrincipalScope(principal),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    name: row.name,
    email: row.email,
    role: row.role as Role,
    schoolName: row.schoolName,
    signInMethod: row.issuer === DEMO_ISSUER ? 'synthetic_demo' : 'school',
    sessionExpiresAt: new Date(row.expiresAt).toISOString(),
  };
}
