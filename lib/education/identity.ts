import { env } from 'cloudflare:workers';

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function setting(name: string): string {
  // Worker bindings take precedence over local process configuration.
  return String((env as unknown as Record<string, unknown>)[name] ?? process.env[name] ?? '').trim();
}

export function httpsUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new AuthError('Invalid identity configuration', 503);
  }
  return url;
}

export function allowedOrigins(): Set<string> {
  const configured = setting('SAHA_ALLOWED_ORIGINS');
  const values = configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(
    values.map((value) => {
      const url = new URL(value);
      const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (
        (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      ) {
        throw new AuthError('Invalid origin configuration', 503);
      }
      return url.origin;
    }),
  );
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (
    !origin ||
    origin === 'null' ||
    origin !== new URL(request.url).origin ||
    !allowedOrigins().has(origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new AuthError('Request origin is not allowed', 403);
  }
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function cookie(request: Request, name: string): string | null {
  const matches = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${name}=`));
  // Duplicate cookie values must not create an ambiguous security context.
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function secureCookie(name: string, value: string, seconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}

export function authFailure(error: unknown): Response {
  const known = error instanceof AuthError;
  return Response.json(
    { error: known ? error.message : 'Sign-in unavailable' },
    {
      status: known ? error.status : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
