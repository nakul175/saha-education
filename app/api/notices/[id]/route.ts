import { authenticated } from '@/lib/education/http';
import { assertNoticeStaff, getSentNotice } from '@/lib/education/notices';

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authenticated(request, false, async principal => {
    assertNoticeStaff(principal);
    return Response.json(await getSentNotice(principal, (await context.params).id));
  });
}
