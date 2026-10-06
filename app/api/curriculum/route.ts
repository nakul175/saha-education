import { authenticated, body } from '@/lib/education/http';
import { listCurriculumReferences, createCurriculumReference, createCurriculumSchema, CurriculumConflict } from '@/lib/education/curriculum';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => Response.json(await listCurriculumReferences(principal)));
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    const input = await body(request, createCurriculumSchema);
    try { return Response.json(await createCurriculumReference(principal, input), { status: 201 }); }
    catch (error) {
      if (error instanceof CurriculumConflict) return Response.json({ error: 'Curriculum reference conflict' }, { status: 409 });
      throw error;
    }
  });
}
