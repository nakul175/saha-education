import { authenticated, body, query } from '@/lib/education/http';
import { assertAcademicStaff } from '@/lib/education/academic-integrity';
import {
  attendanceReviewSchema,
  getAttendanceEditor,
  reviewAttendance,
} from '@/lib/education/attendance-reviews';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) => {
    assertAcademicStaff(principal);
    const { id } = await params;
    return Response.json(await getAttendanceEditor(principal, id, query(request, 'date') ?? ''));
  });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async (principal) => {
    assertAcademicStaff(principal);
    const { id } = await params;
    const result = await reviewAttendance(principal, id, await body(request, attendanceReviewSchema));
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  });
}
