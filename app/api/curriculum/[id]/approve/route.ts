import { authenticated, body } from '@/lib/education/http';
import { approveCurriculumReference, approveCurriculumSchema } from '@/lib/education/curriculum';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    const input = await body(request, approveCurriculumSchema);
    return Response.json(await approveCurriculumReference(principal, (await params).id, input));
  });
}
