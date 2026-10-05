import { authFailure, requireSameOrigin } from '@/lib/education/auth';
import { startLogin } from '@/lib/education/oidc';

export async function POST(request: Request) {
  try { requireSameOrigin(request); return await startLogin(request); }
  catch (error) { return authFailure(error); }
}
