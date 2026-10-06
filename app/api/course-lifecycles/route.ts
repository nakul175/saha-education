import { listCourseStates } from '@/lib/education/academic-lifecycle';
import { authenticated } from '@/lib/education/http';

// Active/retired state for the caller's current-school catalogue. Absence of an override means active.
export async function GET(request: Request) {
  return authenticated(request, false, async principal => Response.json(await listCourseStates(principal)));
}
