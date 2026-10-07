import { authenticated, body } from '@/lib/education/http';
import { assertNoticeStaff, listSentNotices, noticeListQuerySchema, sendNotice, sendNoticeSchema } from '@/lib/education/notices';

// Staff-only, in-app notices. Role is checked before any query string or body is read.
export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    assertNoticeStaff(principal);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => !['limit', 'cursor'].includes(key) || params.getAll(key).length !== 1)) throw new SyntaxError('Invalid notice filter');
    return Response.json(await listSentNotices(principal, noticeListQuerySchema.parse(Object.fromEntries(params))));
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    assertNoticeStaff(principal);
    const result = await sendNotice(principal, await body(request, sendNoticeSchema));
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  });
}
