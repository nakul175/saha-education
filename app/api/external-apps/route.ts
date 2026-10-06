import { authenticated } from '@/lib/education/http';
import { listExternalApps } from '@/lib/education/external-apps';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => Response.json(listExternalApps(principal)));
}
