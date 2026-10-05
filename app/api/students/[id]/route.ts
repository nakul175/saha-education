import { authenticated, body, found } from '@/lib/education/http';
import { getStudent, updateStudent } from '@/lib/education/students';
import { studentSchema } from '@/lib/education/validation';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => {
    const { id } = await params;
    return Response.json(found(await getStudent(principal, id)));
  });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    const { id } = await params;
    return Response.json(found(await updateStudent(principal, id, await body(request, studentSchema))));
  });
}
