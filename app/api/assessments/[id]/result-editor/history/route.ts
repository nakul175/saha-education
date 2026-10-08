import { authenticated, query } from '@/lib/education/http';
import { assertAcademicStaff } from '@/lib/education/academic-integrity';
import { listAssessmentResultReviews } from '@/lib/education/assessment-reviews';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) => {
    assertAcademicStaff(principal);
    const { id } = await params;
    return Response.json(
      await listAssessmentResultReviews(principal, id, { studentId: query(request, 'studentId') }),
    );
  });
}
