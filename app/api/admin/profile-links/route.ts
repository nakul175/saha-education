import { authenticated, body } from '@/lib/education/http';
import { assertAdmin } from '@/lib/education/access';
import {
  listProfileLinks,
  reviewProfileLink,
  reviewedProfileLinkSchema,
  ProfileLinkConflict,
} from '@/lib/education/profile-links';

export async function GET(request: Request) {
  return authenticated(request, false, async (principal) => Response.json(await listProfileLinks(principal)));
}
export async function POST(request: Request) {
  return authenticated(request, true, async (principal) => {
    assertAdmin(principal);
    try {
      return Response.json(
        await reviewProfileLink(principal, await body(request, reviewedProfileLinkSchema)),
      );
    } catch (error) {
      if (error instanceof ProfileLinkConflict)
        return Response.json({ error: 'Profile link conflict' }, { status: 409 });
      throw error;
    }
  });
}
