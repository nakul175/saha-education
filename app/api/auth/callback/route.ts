import { finishLogin, TRANSACTION_COOKIE } from '@/lib/education/oidc';
import { secureCookie } from '@/lib/education/identity';

export async function GET(request: Request) {
  try {
    return await finishLogin(request);
  } catch {
    // Failure details and provider errors never enter the URL or user response.
    const response = new Response(null, {
      status: 303,
      headers: { Location: '/login?error=signin_failed', 'Cache-Control': 'no-store' },
    });
    response.headers.append('Set-Cookie', secureCookie(TRANSACTION_COOKIE, '', 0));
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
}
