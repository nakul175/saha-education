import { authenticated, body, found } from '@/lib/education/http';
import { getSchool, updateSchool } from '@/lib/education/schools';
import { schoolSchema } from '@/lib/education/validation';
import { assertAdmin } from '@/lib/education/access';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) => {
    const { id } = await params;
    return Response.json(found(await getSchool(principal, id)));
  });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async (principal) => {
    assertAdmin(principal);
    const { id } = await params;
    return Response.json(found(await updateSchool(principal, id, await body(request, schoolSchema))));
  });
}
