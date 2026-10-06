import { authenticated } from '@/lib/education/http';
import { assertAdmin } from '@/lib/education/access';
import { auditQuerySchema, listAuditTrail } from '@/lib/education/audit-trail';

// Read-only, administrator-only, current-school timeline. There is no write handler here.
export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    assertAdmin(principal);
    const params = new URL(request.url).searchParams;
    const allowed = ['source', 'actorId', 'from', 'to', 'q', 'limit', 'cursor'];
    if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) throw new SyntaxError('Invalid audit filter');
    return Response.json(await listAuditTrail(principal, auditQuerySchema.parse(Object.fromEntries([...params].filter(([, value]) => value !== '')))));
  });
}
