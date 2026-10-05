import { authenticated } from '@/lib/education/http';
import { listIdentityAdminEvents } from '@/lib/education/identity-admin';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => Response.json(await listIdentityAdminEvents(principal)));
}
