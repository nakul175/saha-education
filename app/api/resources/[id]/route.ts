import { authenticated, body, found } from '@/lib/education/http';
import {
  getResource,
  reviseResource,
  reviseResourceSchema,
  ResourceConflict,
} from '@/lib/education/resources';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) => {
    const { id } = await params;
    return Response.json(found(await getResource(principal, id)));
  });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async (principal) => {
    const { id } = await params;
    const input = await body(request, reviseResourceSchema);
    try {
      return Response.json(await reviseResource(principal, id, input));
    } catch (error) {
      if (error instanceof ResourceConflict)
        return Response.json({ error: 'Resource conflict' }, { status: 409 });
      throw error;
    }
  });
}
