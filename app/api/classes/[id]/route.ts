import { authenticated, body, found } from '@/lib/education/http';
import { getClass, updateClass } from '@/lib/education/classes';
import { classSchema } from '@/lib/education/validation';
import { listEnrolments } from '@/lib/education/enrolments';
import { getStudent } from '@/lib/education/students';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => {
    const { id } = await params;
    const record = found(await getClass(principal, id));
    const enrolments = await listEnrolments(principal, { classId: id });
    const students = await Promise.all(enrolments.map(entry => getStudent(principal, entry.studentId)));
    return Response.json({ ...record, enrolledStudents: students.filter(student => student !== null) });
  });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    const { id } = await params;
    return Response.json(found(await updateClass(principal, id, await body(request, classSchema))));
  });
}
