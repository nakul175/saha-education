import { digest } from '@/lib/education/identity';
import { authenticated } from '@/lib/education/http';
import { getAccountSummary } from '@/lib/education/account';

export async function GET(request: Request) {
  return authenticated(request, false, async (principal) => {
    const summary = await getAccountSummary(request, principal);
    if (!summary) return Response.json({ error: 'Authentication required' }, { status: 401 });
    return Response.json(summary, {
      headers: {
        'x-saha-account-scope': await digest(
          JSON.stringify([principal.id, principal.role, principal.schoolId ?? null]),
        ),
      },
    });
  });
}
