import { authenticated, body, found } from '@/lib/education/http';
import { getAssessment } from '@/lib/education/assessments';
import { assertAcademicStaff } from '@/lib/education/academic-integrity';
import { assessmentRevisionSchema, reviseAssessment } from '@/lib/education/assessment-lifecycle';
import { withConflictCode } from '@/lib/education/lifecycle-conflict';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => {
    const { id } = await params;
    return Response.json(found(await getAssessment(principal, id)));
  });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => withConflictCode(async () => {
    assertAcademicStaff(principal);
    const { id } = await params;
    const outcome = await reviseAssessment(principal, id, await body(request, assessmentRevisionSchema));
    return Response.json(outcome, { status: outcome.replayed ? 200 : 201 });
  }));
}
