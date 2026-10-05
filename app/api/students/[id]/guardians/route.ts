import { authenticated, body } from '@/lib/education/http';
import { listGuardiansForStudent, linkGuardian } from '@/lib/education/students';
import { studentGuardianSchema } from '@/lib/education/validation';
import { assertAdmin } from '@/lib/education/access';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => {
    const { id } = await params;
    return Response.json(await listGuardiansForStudent(principal, id));
  });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    assertAdmin(principal);
    const { id } = await params;
    const input = await body(request, studentGuardianSchema.omit({ studentId: true }));
    await linkGuardian(principal, id, input.guardianId);
    return Response.json({ message: 'Guardian linked successfully' });
  });
}
