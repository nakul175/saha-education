import { authenticated, query } from '@/lib/education/http';
import { assertAcademicStaff } from '@/lib/education/academic-integrity';
import { listAttendanceReviews } from '@/lib/education/attendance-reviews';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async principal => {
    assertAcademicStaff(principal);
    const { id } = await params;
    return Response.json(await listAttendanceReviews(principal, id, { date: query(request, 'date') ?? '', studentId: query(request, 'studentId') }));
  });
}
