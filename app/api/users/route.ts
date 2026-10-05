import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db/index';
import { users } from '@/db/schema';
import { assertAdmin, assertPrincipal } from '@/lib/education/access';
import { authenticated, query } from '@/lib/education/http';

// Accounts are provisioned through trusted identity mapping, never this endpoint.
export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    assertAdmin(principal);
    assertPrincipal(principal);
    const role = z.enum(['admin', 'teacher', 'guardian', 'student']).optional().parse(query(request, 'role'));
    const records = await getDb().select({ id: users.id, name: users.name, role: users.role })
      .from(users).where(and(eq(users.schoolId, principal.schoolId), isNull(users.disabledAt), role ? eq(users.role, role) : undefined));
    return Response.json(records);
  });
}
