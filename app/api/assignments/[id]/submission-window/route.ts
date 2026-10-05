import { authenticated, body } from '@/lib/education/http';
import { assertWindowStaff, getSubmissionWindow, reviewSubmissionWindow, submissionWindowSchema } from '@/lib/education/submission-windows';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authenticated(request, false, async principal => Response.json(await getSubmissionWindow(principal, (await context.params).id)));
}
export async function POST(request: Request, context: Context) {
  return authenticated(request, true, async principal => {
    assertWindowStaff(principal);
    return Response.json(await reviewSubmissionWindow(principal, (await context.params).id, await body(request, submissionWindowSchema)), { status: 201 });
  });
}
