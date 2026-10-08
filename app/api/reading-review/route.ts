import { authenticated, query } from '@/lib/education/http';
import { getReadingReview } from '@/lib/education/reading-review';

export async function GET(request: Request) {
  return authenticated(request, false, async (principal) =>
    Response.json(
      await getReadingReview(principal, {
        studentId: query(request, 'studentId'),
        classId: query(request, 'classId'),
      }),
    ),
  );
}
