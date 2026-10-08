import { authenticated } from '@/lib/education/http';
import { listResourceVersions } from '@/lib/education/resources';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) => {
    const { id } = await params;
    return Response.json(await listResourceVersions(principal, id));
  });
}
