import { updateSchoolTerm } from '@/lib/education/school-setup';
import { jsonInput, recordRoute } from '@/lib/education/record-support';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; termId: string }> }) {
  return recordRoute(request, true, async principal => {
    const { id, termId } = await params;
    return Response.json({ term: await updateSchoolTerm(principal, id, termId, await jsonInput(request)) });
  });
}
