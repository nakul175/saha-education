import { authenticated } from '@/lib/education/http';
import { getAssignmentSummaries } from '@/lib/education/submission-progress';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => Response.json(await getAssignmentSummaries(principal)));
}
