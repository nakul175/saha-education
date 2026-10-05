import { and, sql, type SQL } from 'drizzle-orm';
import { demoIdentityScope } from './demo-policy';
import type { Principal, Role } from './types';

type VerifiedSessionIdentity = Readonly<{
  tokenHash: string;
  userId: string;
  identityIssuer: string;
  identitySubject: string;
}>;

// This evidence belongs to the server object, never its public JSON or a
// client-supplied field. Re-resolving a new valid session creates new evidence.
const verifiedSessions = new WeakMap<Principal, VerifiedSessionIdentity>();

export function verifiedSessionPrincipal(user: {
  id: string; role: Role; schoolId: string; identityIssuer: string; identitySubject: string;
}, tokenHash: string): Principal {
  const principal: Principal = Object.freeze({ id: user.id, role: user.role, schoolId: user.schoolId });
  verifiedSessions.set(principal, Object.freeze({ tokenHash, userId: user.id,
    identityIssuer: user.identityIssuer, identitySubject: user.identitySubject }));
  return principal;
}

/** Compose into the actual protected SQL statement. Trusted internal callers
 * retain the existing account-scoped contract; HTTP callers must first resolve
 * an opaque session through getPrincipal/getServerPrincipal. Public JSON is a
 * DTO, never an alternative authentication mechanism. */
export function sessionExecutionScope(principal: Principal): SQL {
  const verified = verifiedSessions.get(principal);
  if (!verified) return sql`1`;
  return and(demoIdentityScope(verified.identityIssuer, principal.schoolId!), sql`exists (select 1 from auth_sessions execution_session
    join users execution_account on execution_account.id = execution_session.user_id
    where execution_session.token_hash = ${verified.tokenHash}
      and execution_session.user_id = ${verified.userId} and execution_account.id = ${principal.id}
      and execution_session.expires_at > (cast(strftime('%s', 'now') as integer) * 1000
        + cast(substr(strftime('%f', 'now'), 4, 3) as integer))
      and execution_account.school_id = ${principal.schoolId} and execution_account.role = ${principal.role}
      and execution_account.disabled_at is null
      and execution_account.identity_issuer = ${verified.identityIssuer}
      and execution_account.identity_subject = ${verified.identitySubject})`)!;
}
