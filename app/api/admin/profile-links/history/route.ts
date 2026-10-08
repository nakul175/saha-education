import { authenticated } from '@/lib/education/http';
import { assertAdmin } from '@/lib/education/access';
import { listProfileLinkHistory, profileLinkHistorySchema } from '@/lib/education/profile-links';

export async function GET(request: Request) {
  return authenticated(request, false, async (principal) => {
    assertAdmin(principal);
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some((key) => !['profileType', 'profileId'].includes(key)) ||
      [...params.keys()].some((key) => params.getAll(key).length !== 1)
    )
      throw new SyntaxError('Invalid profile filter');
    const filter = profileLinkHistorySchema.parse(Object.fromEntries(params));
    return Response.json(await listProfileLinkHistory(principal, filter));
  });
}
