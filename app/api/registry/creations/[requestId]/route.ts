import { authenticated } from '@/lib/education/http';
import { getRegistryCreation } from '@/lib/education/registry-create';

type Context = { params: Promise<{ requestId: string }> };
export async function GET(request: Request, context: Context) {
  return authenticated(request, false, async (principal) =>
    Response.json(await getRegistryCreation(principal, (await context.params).requestId)),
  );
}
