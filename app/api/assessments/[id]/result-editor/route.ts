import { authenticated, body } from '@/lib/education/http';
import { assertAcademicStaff } from '@/lib/education/academic-integrity';
import { assessmentResultReviewSchema, getAssessmentResultEditor, reviewAssessmentResults } from '@/lib/education/assessment-reviews';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => {
    assertAcademicStaff(principal);
    const { id } = await params;
    return Response.json(await getAssessmentResultEditor(principal, id));
  });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    assertAcademicStaff(principal);
    const { id } = await params;
    const outcome = await reviewAssessmentResults(principal, id, await body(request, assessmentResultReviewSchema));
    return Response.json(outcome, { status: outcome.replayed ? 200 : 201 });
  });
}
