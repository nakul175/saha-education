import { authenticated, body, query } from '@/lib/education/http';
import { listCourses, createCourse } from '@/lib/education/courses';
import { courseSchema } from '@/lib/education/validation';
import { assertAdmin } from '@/lib/education/access';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    return Response.json(await listCourses(principal, query(request, 'schoolId')));
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    assertAdmin(principal);
    return Response.json(await createCourse(principal, await body(request, courseSchema)), { status: 201 });
  });
}
