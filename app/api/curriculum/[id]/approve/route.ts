import { authenticated, body } from '@/lib/education/http';
import {
  approveCurriculumReference,
  approveCurriculumSchema,
  CurriculumConflict,
} from '@/lib/education/curriculum';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async (principal) => {
    const input = await body(request, approveCurriculumSchema);
    try {
      return Response.json(await approveCurriculumReference(principal, (await params).id, input));
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
