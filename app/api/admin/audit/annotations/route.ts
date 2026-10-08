import { authenticated, body } from '@/lib/education/http';
import { assertAdmin } from '@/lib/education/access';
import { addAuditNote, auditNoteSchema } from '@/lib/education/audit-trail';

// A correction note is appended beside an audit entry; the entry itself is never changed.
export async function POST(request: Request) {
  return authenticated(request, true, async (principal) => {
    assertAdmin(principal);
    const result = await addAuditNote(principal, await body(request, auditNoteSchema));
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  });
}
