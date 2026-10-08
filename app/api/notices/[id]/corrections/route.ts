import { authenticated, body } from '@/lib/education/http';
import { assertNoticeStaff, noticeCorrectionSchema, sendNoticeCorrection } from '@/lib/education/notices';

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return authenticated(request, true, async (principal) => {
    assertNoticeStaff(principal);
    const result = await sendNoticeCorrection(
      principal,
      (await context.params).id,
      await body(request, noticeCorrectionSchema),
    );
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  });
}
