import { setStudentStatus } from '@/lib/education/student-records';
import { jsonInput, recordRoute } from '@/lib/education/record-support';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return recordRoute(request, true, async principal => {
    const { id } = await params;
    const result = await setStudentStatus(principal, id, await jsonInput(request));
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  });
}
