import { z } from 'zod';
import { authenticated } from '@/lib/education/http';
import { assertNoticeStaff, listNoticePeople } from '@/lib/education/notices';

const querySchema = z
  .object({ q: z.string().max(60).optional(), limit: z.coerce.number().int().min(1).max(50).optional() })
  .strict();
export async function GET(request: Request) {
  return authenticated(request, false, async (principal) => {
    assertNoticeStaff(principal);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => !['q', 'limit'].includes(key) || params.getAll(key).length !== 1))
      throw new SyntaxError('Invalid recipient filter');
    return Response.json(await listNoticePeople(principal, querySchema.parse(Object.fromEntries(params))));
  });
}
