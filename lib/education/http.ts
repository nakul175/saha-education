import { z } from 'zod';
import { getPrincipal, requireSameOrigin, AuthError } from './auth';
import { AccessError } from './access';
import type { Principal } from './types';

/** Every education endpoint authenticates before parsing or accessing records. */
export async function authenticated(request: Request, mutation: boolean, action: (principal: Principal) => Promise<Response>): Promise<Response> {
  try {
    const principal = await getPrincipal(request);
    if (!principal) return Response.json({ error: 'Authentication required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    if (mutation) requireSameOrigin(request);
    const response = await action(principal);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const status = error instanceof AccessError || error instanceof AuthError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500;
    const messages: Record<number, string> = { 400: 'Invalid request', 401: 'Authentication required', 403: 'Forbidden', 404: 'Not found', 500: 'Internal server error', 503: 'Service unavailable' };
    return Response.json({ error: messages[status] || messages[500] }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function body<T>(request: Request, schema: z.ZodSchema<T>): Promise<T> {
  return schema.parse(await request.json());
}

export function found<T>(value: T | null): T {
  if (value === null) throw new AccessError('Not found', 404);
  return value;
}

export function query(request: Request, key: string): string | undefined {
  return new URL(request.url).searchParams.get(key) || undefined;
}
