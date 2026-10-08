import { assertAdmin } from '@/lib/education/access';
import { authenticated, body } from '@/lib/education/http';
import { reviewStudentCreation, studentCreationSchema } from '@/lib/education/registry-create';

export async function POST(request: Request) {
  return authenticated(request, true, async (principal) => {
    assertAdmin(principal);
    const result = await reviewStudentCreation(principal, await body(request, studentCreationSchema));
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  });
}
