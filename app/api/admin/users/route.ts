import { authenticated, body } from '@/lib/education/http';
import { assertAdmin } from '@/lib/education/access';
import { listAdminUsers, provisionIdentity, provisionIdentitySchema, IdentityAdminConflict } from '@/lib/education/identity-admin';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => Response.json(await listAdminUsers(principal)));
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    assertAdmin(principal);
    const input = await body(request, provisionIdentitySchema);
    try { return Response.json(await provisionIdentity(principal, input), { status: 201 }); }
    catch (error) {
      if (error instanceof IdentityAdminConflict) return Response.json({ error: 'Identity administration conflict' }, { status: 409 });
      throw error;
    }
  });
}
