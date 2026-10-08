import { authenticated } from '@/lib/education/http';
import { assertAdmin } from '@/lib/education/access';
import { getAuditEntry } from '@/lib/education/audit-trail';

type Context = { params: Promise<{ source: string; sourceId: string }> };
export async function GET(request: Request, context: Context) {
  return authenticated(request, false, async (principal) => {
    assertAdmin(principal);
    const { source, sourceId } = await context.params;
    return Response.json(await getAuditEntry(principal, source, decodeURIComponent(sourceId)));
  });
}
