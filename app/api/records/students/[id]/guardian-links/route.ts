import { listGuardianLinks, reviewGuardianLink } from '@/lib/education/guardian-links';
import { jsonInput, recordRoute } from '@/lib/education/record-support';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return recordRoute(request, false, async principal => Response.json(await listGuardianLinks(principal, (await params).id)));
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return recordRoute(request, true, async principal => {
    const { id } = await params;
    const result = await reviewGuardianLink(principal, id, await jsonInput(request));
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  });
}
