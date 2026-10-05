import { authenticated, body, query } from '@/lib/education/http';
import { createReadingCheck, listReadingChecks, readingCheckInputSchema, ReadingCheckConflict } from '@/lib/education/reading-checks';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => Response.json(await listReadingChecks(principal, {
    studentId: query(request, 'studentId'), classId: query(request, 'classId'),
  })));
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    const input = await body(request, readingCheckInputSchema);
    try {
      return Response.json(await createReadingCheck(principal, input), { status: 201 });
    } catch (error) {
      if (error instanceof ReadingCheckConflict) return Response.json({ error: 'Reading check conflict' }, { status: 409 });
      throw error;
    }
  });
}
