import { createSchoolTerm } from '@/lib/education/school-setup';
import { jsonInput, recordRoute } from '@/lib/education/record-support';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return recordRoute(request, true, async (principal) => {
    const { id } = await params;
    const result = await createSchoolTerm(principal, id, await jsonInput(request));
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  });
}
