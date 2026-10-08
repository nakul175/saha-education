import { getStudentRecord, updateStudentRecord } from '@/lib/education/student-records';
import { jsonInput, recordRoute } from '@/lib/education/record-support';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return recordRoute(request, false, async (principal) =>
    Response.json(await getStudentRecord(principal, (await params).id)),
  );
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return recordRoute(request, true, async (principal) => {
    const { id } = await params;
    return Response.json({ student: await updateStudentRecord(principal, id, await jsonInput(request)) });
  });
}
