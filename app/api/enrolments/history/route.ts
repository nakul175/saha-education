import { getStudentHistory } from '@/lib/education/academic-lifecycle';
import { AccessError } from '@/lib/education/access';
import { authenticated, found, query } from '@/lib/education/http';

// One learner's enrolments and history, scoped by the caller's current relationship to that learner.
export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    const studentId = query(request, 'studentId');
    if (!studentId) throw new AccessError('Invalid request', 400);
    return Response.json(found(await getStudentHistory(principal, studentId)));
  });
}
