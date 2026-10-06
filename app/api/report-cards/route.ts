import { authenticated, body, query } from '@/lib/education/http';
import { listReportCards, createReportCard } from '@/lib/education/report-cards';
import { reportCardSchema } from '@/lib/education/validation';
import { assertAdmin } from '@/lib/education/access';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    return Response.json(await listReportCards(principal, query(request, 'studentId')));
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    assertAdmin(principal);
    return Response.json(await createReportCard(principal, await body(request, reportCardSchema)), { status: 201 });
  });
}
