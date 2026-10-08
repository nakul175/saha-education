import { authenticated, body } from '@/lib/education/http';
import { AccessError } from '@/lib/education/access';
import {
  listSubmissionFeedback,
  reviewSubmission,
  feedbackSchema,
  SubmissionConflict,
} from '@/lib/education/submissions';

type Context = { params: Promise<{ id: string; submissionId: string }> };
export async function GET(request: Request, context: Context) {
  return authenticated(request, false, async (principal) => {
    const { id, submissionId } = await context.params;
    return Response.json(await listSubmissionFeedback(principal, id, submissionId));
  });
}
export async function POST(request: Request, context: Context) {
  return authenticated(request, true, async (principal) => {
    if (principal.role !== 'admin' && principal.role !== 'teacher')
      throw new AccessError('Staff review access required');
    const input = await body(request, feedbackSchema);
    const { id, submissionId } = await context.params;
    try {
      return Response.json(await reviewSubmission(principal, id, submissionId, input), { status: 201 });
    } catch (error) {
      if (error instanceof SubmissionConflict)
        return Response.json({ error: 'Submission conflict' }, { status: 409 });
      throw error;
    }
  });
}
