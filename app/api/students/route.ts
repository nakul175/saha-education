import { authenticated, body, query } from '@/lib/education/http';
import { listStudents, createStudent } from '@/lib/education/students';
import { studentSchema } from '@/lib/education/validation';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    return Response.json(await listStudents(principal, query(request, 'schoolId')));
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    return Response.json(await createStudent(principal, await body(request, studentSchema)), { status: 201 });
  });
}
