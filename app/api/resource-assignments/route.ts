import { authenticated, query } from '@/lib/education/http';
import { listResourceAssignments } from '@/lib/education/resources';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => Response.json(await listResourceAssignments(principal, {
    classId: query(request, 'classId'),
  })));
}
