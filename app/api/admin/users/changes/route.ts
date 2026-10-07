import { authenticated } from '@/lib/education/http';
import { listIdentityChanges } from '@/lib/education/identity-changes';

export async function GET(request: Request) {
  return authenticated(request, false, async principal => Response.json(await listIdentityChanges(principal)));
}
