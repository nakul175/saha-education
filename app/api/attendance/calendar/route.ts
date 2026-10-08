import { authenticated, body } from '@/lib/education/http';
import { assertAdmin } from '@/lib/education/access';
import {
  attendanceCalendarInputSchema,
  getAttendanceCalendar,
  saveAttendanceCalendar,
} from '@/lib/education/attendance-calendar';

export async function GET(request: Request) {
  return authenticated(request, false, async (principal) =>
    Response.json(await getAttendanceCalendar(principal)),
  );
}
export async function PUT(request: Request) {
  return authenticated(request, true, async (principal) => {
    assertAdmin(principal);
    return Response.json(
      await saveAttendanceCalendar(principal, await body(request, attendanceCalendarInputSchema)),
    );
  });
}
