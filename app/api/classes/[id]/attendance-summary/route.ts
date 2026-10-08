import { authenticated, found } from '@/lib/education/http';
import { getAttendanceSummary } from '@/lib/education/attendance-summary';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authenticated(request, false, async (principal) =>
    Response.json(found(await getAttendanceSummary(principal, (await context.params).id))),
  );
}
