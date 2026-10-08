import { z } from 'zod';
import { authenticated, boundedText } from '@/lib/education/http';
import { assertExternalAppStaff, launchExternalApp } from '@/lib/education/external-apps';

const launchSchema = z.object({ studentId: z.string().min(1).max(200).optional() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async (principal) => {
    assertExternalAppStaff(principal);
    const { id } = await params;
    const raw = await boundedText(request, { required: false });
    const input = launchSchema.parse(raw.trim() ? JSON.parse(raw) : {});
    return Response.json(await launchExternalApp(principal, id, input));
  });
}
