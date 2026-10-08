import { z } from 'zod';
import { assertAdmin } from '@/lib/education/access';
import { applyAcademicChanges } from '@/lib/education/academic-lifecycle';
import { authenticated, body } from '@/lib/education/http';

// Reviewed, request-UUID-keyed, atomic course/class/enrolment changes. Administrator role is checked before the body is parsed.
export async function POST(request: Request) {
  return authenticated(request, true, async (principal) => {
    assertAdmin(principal);
    const result = await applyAcademicChanges(principal, await body(request, z.unknown()));
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  });
}
