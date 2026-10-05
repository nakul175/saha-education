import { authenticated, body, found, query } from '@/lib/education/http';
import { listEnrolments, enrolStudent, updateEnrolmentStatus } from '@/lib/education/enrolments';
import { enrolmentSchema } from '@/lib/education/validation';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    return Response.json(await listEnrolments(principal, { studentId: query(request, 'studentId'), classId: query(request, 'classId') }));
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    const input = await body(request, enrolmentSchema.pick({ studentId: true, classId: true }));
    return Response.json(await enrolStudent(principal, input.studentId, input.classId), { status: 201 });
  });
}
export async function PATCH(request: Request) {
  return authenticated(request, true, async principal => {
    const input = await body(request, enrolmentSchema.pick({ id: true, status: true }).required());
    return Response.json(found(await updateEnrolmentStatus(principal, input.id, input.status)));
  });
}
