import { ProfileLinkReviewRequired, legacyProfileUserIdSchema } from '@/lib/education/profile-links';
import { authenticated, body } from '@/lib/education/http';
import { listGuardians, createGuardian } from '@/lib/education/guardians';
import { guardianSchema } from '@/lib/education/validation';

export async function GET(request: Request) {
  return authenticated(request, false, async (principal) => {
    return Response.json(await listGuardians(principal));
  });
}
export async function POST(request: Request) {
  return authenticated(request, true, async (principal) => {
    try {
      return Response.json(
        await createGuardian(
          principal,
          await body(request, guardianSchema.extend({ userId: legacyProfileUserIdSchema })),
        ),
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof ProfileLinkReviewRequired)
        return Response.json({ error: error.message }, { status: 400 });
      throw error;
    }
  });
}
