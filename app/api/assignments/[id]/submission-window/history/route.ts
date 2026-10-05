import { authenticated } from '@/lib/education/http';
import { listSubmissionWindowReviews } from '@/lib/education/submission-windows';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authenticated(request, false, async principal => Response.json(await listSubmissionWindowReviews(principal, (await context.params).id)));
}
