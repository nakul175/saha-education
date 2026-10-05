import { authenticated, body, query } from '@/lib/education/http';
import { listAttendance, markAttendance } from '@/lib/education/attendance';
import { attendanceSchema } from '@/lib/education/validation';
import { z } from 'zod';
import { assertAcademicStaff } from '@/lib/education/academic-integrity';
const markSchema = z.object({ classId: z.string().min(1), date: z.string().min(1), entries: z.array(attendanceSchema.pick({ studentId: true, status: true, note: true })) });
export async function GET(request: Request) {
  return authenticated(request, false, async principal => {
    return Response.json(await listAttendance(principal, { classId: query(request, 'classId'), date: query(request, 'date'), studentId: query(request, 'studentId') }));
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async principal => {
    assertAcademicStaff(principal);
    const input = await body(request, markSchema);
    return Response.json(await markAttendance(principal, input.classId, input.date, input.entries, principal.id));
  });
}
