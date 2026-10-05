import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db/index';
import { users } from '@/db/schema';
import { assertAdmin, assertPrincipal, livePrincipalScope } from '@/lib/education/access';
import { authenticated, query } from '@/lib/education/http';

// Accounts are provisioned through trusted identity mapping, never this endpoint.
export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    assertAdmin(principal);
    assertPrincipal(principal);
    const role = z.enum(['admin', 'teacher', 'guardian', 'student']).optional().parse(query(request, 'role'));
    const records = await getDb().select({ id: users.id, name: users.name, role: users.role })
      .from(users).where(and(eq(users.schoolId, principal.schoolId), isNull(users.disabledAt), livePrincipalScope(principal),
        sql`${users.identityIssuer} is not null and ${users.identityIssuer} <> ''
          and ${users.identitySubject} is not null and ${users.identitySubject} <> ''`, role ? eq(users.role, role) : undefined));
    return Response.json(records);
  });
}
