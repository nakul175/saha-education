import { z } from 'zod';
import { authenticated, body } from '@/lib/education/http';
import { approveResource, ResourceConflict } from '@/lib/education/resources';

const approvalSchema = z.object({ versionId: z.string().min(1).max(120) }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    const { id } = await params;
    const input = await body(request, approvalSchema);
    try {
      return Response.json(await approveResource(principal, id, input.versionId));
    } catch (error) {
      if (error instanceof ResourceConflict) return Response.json({ error: 'Resource conflict' }, { status: 409 });
      throw error;
    }
  });
}
