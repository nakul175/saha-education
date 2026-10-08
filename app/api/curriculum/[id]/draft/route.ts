import { authenticated, body } from '@/lib/education/http';
import { copyCurriculumToDraft, copyCurriculumSchema, CurriculumConflict } from '@/lib/education/curriculum';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async (principal) => {
    const input = await body(request, copyCurriculumSchema);
    try {
      return Response.json(await copyCurriculumToDraft(principal, (await params).id, input), { status: 201 });
    } catch (error) {
      if (error instanceof CurriculumConflict)
        return Response.json({ error: 'Curriculum reference conflict' }, { status: 409 });
      throw error;
    }
  });
}
