import { authenticated, body, query } from '@/lib/education/http';
import { listClasses, createClass } from '@/lib/education/classes';
import { classSchema } from '@/lib/education/validation';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    return Response.json(await listClasses(principal, query(request, 'schoolId')));
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    return Response.json(await createClass(principal, await body(request, classSchema)), { status: 201 });
  });
}
