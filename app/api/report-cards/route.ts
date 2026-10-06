import { authenticated, body, query } from '@/lib/education/http';
import { listReportCards, createReportCard } from '@/lib/education/report-cards';
import { compileReportCard, reportCompileSchema } from '@/lib/education/report-compile';
import { withConflictCode } from '@/lib/education/lifecycle-conflict';
import { assertAdmin } from '@/lib/education/access';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    return Response.json(await listReportCards(principal, query(request, 'studentId')));
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => withConflictCode(async () => {
    assertAdmin(principal);
    const input = await body(request, reportCompileSchema);
    // A plain draft keeps its original contract; selected published results or a correction link compile atomically.
    const compiled = (input.assessmentIds?.length ?? 0) > 0 || input.correction !== undefined;
    return Response.json(compiled ? await compileReportCard(principal, input) : await createReportCard(principal, input), { status: 201 });
  }));
}
