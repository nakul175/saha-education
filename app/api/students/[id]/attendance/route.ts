import { authenticated, found, query } from '@/lib/education/http';
import { getStudentAttendanceReport } from '@/lib/education/attendance-reports';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) => {
    const { id } = await params;
    return Response.json(
      found(
        await getStudentAttendanceReport(principal, id, {
          from: query(request, 'from'),
          to: query(request, 'to'),
        }),
      ),
    );
  });
}
