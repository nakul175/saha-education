import { z } from 'zod';
import { authenticated } from '@/lib/education/http';
import { getCurriculumSnapshot } from '@/lib/education/curriculum';

const snapshotQuery = z.object({ versionId: z.string().min(1).max(120) }).strict();
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => {
    const search = new URL(request.url).searchParams;
    if (search.getAll('versionId').length !== 1) throw new z.ZodError([{ code: 'custom', path: ['versionId'], message: 'Choose one source version' }]);
    const input = snapshotQuery.parse(Object.fromEntries(search));
    return Response.json(await getCurriculumSnapshot(principal, (await params).id, input.versionId));
  });
}
