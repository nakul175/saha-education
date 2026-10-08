import { authenticated, query } from '@/lib/education/http';
import { assertAcademicStaff } from '@/lib/education/academic-integrity';
import { listAssessmentOverview } from '@/lib/education/assessment-lifecycle';

export async function GET(request: Request) {
  return authenticated(request, false, async (principal) => {
    assertAcademicStaff(principal);
    const classId = query(request, 'classId');
    return Response.json(await listAssessmentOverview(principal, classId ? { classId } : {}));
  });
}
