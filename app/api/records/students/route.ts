import { listStudentDirectory } from '@/lib/education/student-records';
import { recordRoute, searchInput } from '@/lib/education/record-support';

export async function GET(request: Request) {
  return recordRoute(request, false, async principal => Response.json(await listStudentDirectory(principal, searchInput(request))));
}
