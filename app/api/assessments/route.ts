import { authenticated, body, query } from '@/lib/education/http';
import { listAssessments, createAssessment } from '@/lib/education/assessments';
import { assessmentSchema } from '@/lib/education/validation';
import { assertAcademicStaff } from '@/lib/education/academic-integrity';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    const classId = query(request, 'classId');
    return Response.json(await listAssessments(principal, classId ? { classId } : undefined));
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    assertAcademicStaff(principal);
    return Response.json(await createAssessment(principal, await body(request, assessmentSchema)), { status: 201 });
  });
}
