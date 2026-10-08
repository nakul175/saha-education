import { authenticated, body, found } from '@/lib/education/http';
import { getClassWithStudents, updateClass } from '@/lib/education/classes';
import { classSchema } from '@/lib/education/validation';
import { assertAdmin } from '@/lib/education/access';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) => {
    const { id } = await params;
    return Response.json(found(await getClassWithStudents(principal, id)));
  });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async (principal) => {
    assertAdmin(principal);
    const { id } = await params;
    return Response.json(found(await updateClass(principal, id, await body(request, classSchema))));
  });
}
