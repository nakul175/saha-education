import { authenticated, found } from '@/lib/education/http';
import { getReportDetail } from '@/lib/education/report-compile';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) => {
    const { id } = await params;
    return Response.json(found(await getReportDetail(principal, id)));
  });
}
