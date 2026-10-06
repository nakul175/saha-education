import { authenticated, body } from '@/lib/education/http';
import { setCurriculumStatus, listCurriculumStatusEvents, curriculumStatusSchema, CurriculumConflict } from '@/lib/education/curriculum';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => Response.json(await listCurriculumStatusEvents(principal, (await params).id)));
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    const input = await body(request, curriculumStatusSchema);
    try { return Response.json(await setCurriculumStatus(principal, (await params).id, input), { status: 201 }); }
    catch (error) {
      if (error instanceof CurriculumConflict) return Response.json({ error: 'Curriculum reference conflict' }, { status: 409 });
      throw error;
    }
  });
}
