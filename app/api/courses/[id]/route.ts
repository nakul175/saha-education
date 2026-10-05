import { authenticated, body, found } from '@/lib/education/http';
import { getCourse, updateCourse } from '@/lib/education/courses';
import { courseSchema } from '@/lib/education/validation';
import { assertAdmin } from '@/lib/education/access';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => {
    const { id } = await params;
    return Response.json(found(await getCourse(principal, id)));
  });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    assertAdmin(principal);
    const { id } = await params;
    return Response.json(found(await updateCourse(principal, id, await body(request, courseSchema))));
  });
}
