import { authenticated } from '@/lib/education/http';
import { assertNoticeStaff, noticeAudienceQuerySchema, previewNoticeAudience } from '@/lib/education/notices';

export async function GET(request: Request) {
  return authenticated(request, false, async (principal) => {
    assertNoticeStaff(principal);
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some((key) => !['classId', 'roles'].includes(key) || params.getAll(key).length !== 1)
    )
      throw new SyntaxError('Invalid audience');
    return Response.json(
      await previewNoticeAudience(principal, noticeAudienceQuerySchema.parse(Object.fromEntries(params))),
    );
  });
}
