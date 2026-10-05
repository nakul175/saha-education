import { authenticated } from '@/lib/education/http';
import { listCurriculumVersions } from '@/lib/education/curriculum';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => Response.json(await listCurriculumVersions(principal, (await params).id)));
}
