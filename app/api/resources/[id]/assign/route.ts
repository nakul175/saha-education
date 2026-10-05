import { authenticated, body } from '@/lib/education/http';
import { assignResource, assignmentSchema, ResourceConflict } from '@/lib/education/resources';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    const { id } = await params;
    const input = await body(request, assignmentSchema);
    try {
      return Response.json(await assignResource(principal, id, input), { status: 201 });
    } catch (error) {
      if (error instanceof ResourceConflict) return Response.json({ error: 'Resource conflict' }, { status: 409 });
      throw error;
    }
  });
}
