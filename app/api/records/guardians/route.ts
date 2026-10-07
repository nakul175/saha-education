import { listGuardianDirectory } from '@/lib/education/guardian-records';
import { recordRoute, searchInput } from '@/lib/education/record-support';

export async function GET(request: Request) {
  return recordRoute(request, false, async principal => Response.json(await listGuardianDirectory(principal, searchInput(request))));
}
