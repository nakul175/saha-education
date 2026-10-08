import { authenticated, body } from '@/lib/education/http';
import {
  appendReadingCorrection,
  assertReadingReviewStaff,
  listReadingCorrections,
  readingCorrectionInputSchema,
  ReadingReviewConflict,
} from '@/lib/education/reading-review';

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authenticated(request, false, async (principal) => {
    assertReadingReviewStaff(principal);
    const { id } = await context.params;
    return Response.json(await listReadingCorrections(principal, id));
  });
}
export async function POST(request: Request, context: Context) {
  return authenticated(request, true, async (principal) => {
    assertReadingReviewStaff(principal);
    const { id } = await context.params;
    const input = await body(request, readingCorrectionInputSchema);
    try {
      return Response.json(await appendReadingCorrection(principal, id, input), { status: 201 });
    } catch (error) {
      if (error instanceof ReadingReviewConflict)
        return Response.json({ error: 'Reading correction conflict' }, { status: 409 });
      throw error;
    }
  });
}
