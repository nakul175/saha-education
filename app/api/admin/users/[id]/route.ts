import { authenticated, body } from '@/lib/education/http';
import { assertAdmin } from '@/lib/education/access';
import { changeIdentityStatus, changeIdentityStatusSchema, IdentityAdminConflict } from '@/lib/education/identity-admin';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    const { id } = await params;
    assertAdmin(principal);
    const input = await body(request, changeIdentityStatusSchema);
    try { return Response.json(await changeIdentityStatus(principal, id, input)); }
    catch (error) {
      if (error instanceof IdentityAdminConflict) return Response.json({ error: 'Identity administration conflict' }, { status: 409 });
      throw error;
    }
  });
}
