import { authFailure, requireSameOrigin } from '@/lib/education/auth';
import { oidcConfig, startLogin } from '@/lib/education/oidc';

/** Reports only whether school sign-in is configured; no provider detail or secret leaves the server. */
export async function GET() {
  let configured = false;
  try { oidcConfig(); configured = true; } catch { /* Missing or invalid configuration stays unavailable. */ }
  return Response.json({ configured }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); return await startLogin(request); }
  catch (error) { return authFailure(error); }
}
