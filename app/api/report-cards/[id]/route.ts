import { authenticated, body, found } from '@/lib/education/http';
import { getReportCard, publishReportCard } from '@/lib/education/report-cards';
import { z } from 'zod';
import { assertAdmin } from '@/lib/education/access';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => {
    const { id } = await params;
    return Response.json(found(await getReportCard(principal, id)));
  });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    assertAdmin(principal);
    const { id } = await params;
    await body(request, z.object({ publish: z.literal(true) }));
    return Response.json(found(await publishReportCard(principal, id)));
  });
}
