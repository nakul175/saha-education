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
    const messages: Record<number, string> = { 400: 'Invalid request', 401: 'Authentication required', 403: 'Forbidden', 404: 'Not found', 409: 'Conflict', 500: 'Internal server error', 503: 'Service unavailable' };
    // A stable lifecycle code (for example `class-full`) lets a client explain a conflict; it never carries record contents.
    const rawCode = error instanceof AccessError ? (error as unknown as { code?: unknown }).code : undefined;
    const code = typeof rawCode === 'string' && /^[a-z-]{1,40}$/.test(rawCode) ? rawCode : undefined;
    return Response.json({ error: messages[status] || messages[500], ...(code ? { code } : {}) }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const MAX_JSON_BODY_BYTES = 128 * 1024;
export async function body<T>(request: Request, schema: z.ZodSchema<T>): Promise<T> {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_JSON_BODY_BYTES)) {
    throw new SyntaxError('Invalid request body size');
  }
  if (!request.body) throw new SyntaxError('JSON body required');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new SyntaxError('Request body too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new SyntaxError('Invalid JSON encoding'); }
  return schema.parse(JSON.parse(text));
}

export function found<T>(value: T | null): T {
  if (value === null) throw new AccessError('Not found', 404);
  return value;
}

export function query(request: Request, key: string): string | undefined {
  return new URL(request.url).searchParams.get(key) || undefined;
}
