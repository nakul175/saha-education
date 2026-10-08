import { authFailure, getPrincipal, requireSameOrigin } from '@/lib/education/auth';
import { secureCookie } from '@/lib/education/identity';
import { revokeSession, SESSION_COOKIE } from '@/lib/education/session';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    return Response.json(
      { error: 'Role selection is disabled; use the school sign-in provider' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return authFailure(error);
  }
}

export async function GET(request: Request) {
  try {
    const principal = await getPrincipal(request);
    return Response.json(principal ?? { error: 'Not authenticated' }, {
      status: principal ? 200 : 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return authFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await revokeSession(request);
    const response = Response.json({ message: 'Logged out' }, { headers: { 'Cache-Control': 'no-store' } });
    response.headers.append('Set-Cookie', secureCookie(SESSION_COOKIE, '', 0));
    response.headers.append(
      'Set-Cookie',
      'saha_demo_role=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    );
    return response;
  } catch (error) {
    return authFailure(error);
  }
}
