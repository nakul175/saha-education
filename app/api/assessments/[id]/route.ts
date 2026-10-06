import { authenticated, found } from '@/lib/education/http';
import { getAssessment } from '@/lib/education/assessments';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => {
    const { id } = await params;
    return Response.json(found(await getAssessment(principal, id)));
  });
}
