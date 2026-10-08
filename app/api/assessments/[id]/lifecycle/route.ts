import { authenticated, body } from '@/lib/education/http';
import { assertAcademicStaff } from '@/lib/education/academic-integrity';
import {
  assessmentPublicationSchema,
  changeAssessmentPublication,
  getAssessmentLifecycle,
} from '@/lib/education/assessment-lifecycle';
import { withConflictCode } from '@/lib/education/lifecycle-conflict';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) => {
    assertAcademicStaff(principal);
    const { id } = await params;
    return Response.json(await getAssessmentLifecycle(principal, id));
  });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async (principal) =>
    withConflictCode(async () => {
      assertAcademicStaff(principal);
      const { id } = await params;
      const outcome = await changeAssessmentPublication(
        principal,
        id,
        await body(request, assessmentPublicationSchema),
      );
      return Response.json(outcome, { status: outcome.replayed ? 200 : 201 });
    }),
  );
}
