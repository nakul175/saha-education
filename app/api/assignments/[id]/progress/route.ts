import { authenticated } from '@/lib/education/http';
import { getAssignmentRoster } from '@/lib/education/submission-progress';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => Response.json(await getAssignmentRoster(principal, (await params).id)));
}
