import { getSchoolSetup, updateSchoolSetup } from '@/lib/education/school-setup';
import { jsonInput, recordRoute } from '@/lib/education/record-support';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return recordRoute(request, false, async (principal) =>
    Response.json(await getSchoolSetup(principal, (await params).id)),
  );
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return recordRoute(request, true, async (principal) => {
    const { id } = await params;
    return Response.json(await updateSchoolSetup(principal, id, await jsonInput(request)));
  });
}
