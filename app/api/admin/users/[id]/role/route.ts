import { authenticated, body } from '@/lib/education/http';
import { assertAdmin } from '@/lib/education/access';
import { IdentityAdminConflict } from '@/lib/education/identity-admin';
import { changeRole, changeRoleSchema } from '@/lib/education/identity-changes';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    const { id } = await params;
    assertAdmin(principal);
    const input = await body(request, changeRoleSchema);
    try { return Response.json(await changeRole(principal, id, input)); }
    catch (error) {
      if (error instanceof IdentityAdminConflict) return Response.json({ error: 'Identity administration conflict', reason: error.reason }, { status: 409 });
      throw error;
    }
  });
}
