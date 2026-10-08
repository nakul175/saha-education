import { authenticated, body } from '@/lib/education/http';
import { AccessError } from '@/lib/education/access';
import {
  listSubmissions,
  submitAssignment,
  submissionSchema,
  SubmissionConflict,
} from '@/lib/education/submissions';
import { SubmissionWindowClosed } from '@/lib/education/submission-windows';

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authenticated(request, false, async (principal) =>
    Response.json(await listSubmissions(principal, (await context.params).id)),
  );
}
export async function POST(request: Request, context: Context) {
  return authenticated(request, true, async (principal) => {
    if (principal.role !== 'student') throw new AccessError('Student submission access required');
    const input = await body(request, submissionSchema);
    try {
      return Response.json(await submitAssignment(principal, (await context.params).id, input), {
        status: 201,
      });
    } catch (error) {
      if (error instanceof SubmissionWindowClosed)
        return Response.json(
          { error: 'Submission window closed', code: 'submission-window-closed' },
          { status: 409 },
        );
      if (error instanceof SubmissionConflict)
        return Response.json({ error: 'Submission conflict' }, { status: 409 });
      throw error;
    }
  });
}
