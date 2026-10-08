import { z } from 'zod';
import { AuthError, authFailure, requireSameOrigin } from '@/lib/education/identity';
import { body } from '@/lib/education/http';
import { demoRuntimeAllowed } from '@/lib/education/demo-policy';
import { demoSignInSchema, signInToSyntheticDemo } from '@/lib/education/demo';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    { available: demoRuntimeAllowed(), synthetic: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!demoRuntimeAllowed()) throw new AuthError('Demo unavailable', 404);
    return await signInToSyntheticDemo(request, await body(request, demoSignInSchema));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json(
        { error: 'Choose a demo role and acknowledge the fictional data.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return authFailure(error);
  }
}
