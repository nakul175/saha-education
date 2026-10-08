import { authenticated, body } from '@/lib/education/http';
import {
  listResources,
  createResource,
  createResourceSchema,
  ResourceConflict,
} from '@/lib/education/resources';

export async function GET(request: Request) {
  return authenticated(request, false, async (principal) => Response.json(await listResources(principal)));
}
export async function POST(request: Request) {
  return authenticated(request, true, async (principal) => {
    const input = await body(request, createResourceSchema);
    try {
      return Response.json(await createResource(principal, input), { status: 201 });
    } catch (error) {
      if (error instanceof ResourceConflict)
        return Response.json({ error: 'Resource conflict' }, { status: 409 });
      throw error;
    }
  });
}
