import { assertAdmin } from '@/lib/education/access';
import { listCourseHistory } from '@/lib/education/academic-lifecycle';
import { authenticated, found } from '@/lib/education/http';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => {
    assertAdmin(principal);
    const { id } = await params;
    return Response.json(found(await listCourseHistory(principal, id)));
  });
}
