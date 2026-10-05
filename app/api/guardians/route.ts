import { authenticated, body } from '@/lib/education/http';
import { listGuardians, createGuardian } from '@/lib/education/guardians';
import { guardianSchema } from '@/lib/education/validation';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    return Response.json(await listGuardians(principal));
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    return Response.json(await createGuardian(principal, await body(request, guardianSchema)), { status: 201 });
  });
}
