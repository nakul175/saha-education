import { authenticated, found, query } from '@/lib/education/http';
import { assertAcademicStaff } from '@/lib/education/academic-integrity';
import { getClassAttendanceReport } from '@/lib/education/attendance-reports';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) => {
    assertAcademicStaff(principal);
    const { id } = await params;
    return Response.json(
      found(
        await getClassAttendanceReport(principal, id, {
          from: query(request, 'from'),
          to: query(request, 'to'),
        }),
      ),
    );
  });
}
