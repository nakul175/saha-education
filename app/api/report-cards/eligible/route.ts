import { authenticated, query } from '@/lib/education/http';
import { assertAdmin, AccessError } from '@/lib/education/access';
import { listEligibleResults } from '@/lib/education/report-compile';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    assertAdmin(principal);
    const studentId = query(request, 'studentId');
    if (!studentId) throw new AccessError('Student required', 400);
    return Response.json(await listEligibleResults(principal, studentId));
  });
}
