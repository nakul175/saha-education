import { authenticated, body } from '@/lib/education/http';
import { listResults, recordResults } from '@/lib/education/assessments';
import { assessmentResultSchema } from '@/lib/education/validation';
import { z } from 'zod';
import { assertAcademicStaff } from '@/lib/education/academic-integrity';
const resultsSchema = z.object({
  results: z.array(
    assessmentResultSchema.pick({ studentId: true, score: true, grade: true, feedback: true }),
  ),
});
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) => {
    const { id } = await params;
    return Response.json(await listResults(principal, id));
  });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async (principal) => {
    assertAcademicStaff(principal);
    const { id } = await params;
    const input = await body(request, resultsSchema);
    await recordResults(principal, id, input.results);
    return Response.json({ message: 'Results recorded successfully' });
  });
}
