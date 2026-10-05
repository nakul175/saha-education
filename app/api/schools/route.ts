import { authenticated, body } from '@/lib/education/http';
import { listSchools, createSchool } from '@/lib/education/schools';
import { schoolSchema } from '@/lib/education/validation';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    return Response.json(await listSchools(principal));
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    return Response.json(await createSchool(principal, await body(request, schoolSchema)), { status: 201 });
  });
}
