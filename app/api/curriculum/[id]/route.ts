import { authenticated, body } from '@/lib/education/http';
import {
  getCurriculumReference,
  reviseCurriculumReference,
  reviseCurriculumSchema,
  CurriculumConflict,
} from '@/lib/education/curriculum';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) =>
    Response.json(await getCurriculumReference(principal, (await params).id)),
  );
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async (principal) => {
    const input = await body(request, reviseCurriculumSchema);
    try {
      return Response.json(await reviseCurriculumReference(principal, (await params).id, input));
    } catch (error) {
      if (error instanceof CurriculumConflict)
        return Response.json(
          { error: 'Curriculum reference conflict', ...(error.code ? { code: error.code } : {}) },
          { status: 409 },
        );
      throw error;
    }
  });
}
