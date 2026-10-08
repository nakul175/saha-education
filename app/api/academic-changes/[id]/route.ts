import { assertAdmin } from '@/lib/education/access';
import { getAcademicChange } from '@/lib/education/academic-lifecycle';
import { authenticated } from '@/lib/education/http';

// Only the original current administrator can recover the immutable receipt of an uncertain request.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) => {
    assertAdmin(principal);
    const { id } = await params;
    return Response.json(await getAcademicChange(principal, id));
  });
}
