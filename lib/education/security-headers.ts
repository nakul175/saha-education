// Browser security headers applied to every response by the Worker entry (worker/index.ts). They are defence in depth
// for the browser only: server-side authorization, Origin checks and no-store API responses remain the authority.
//
// The page CSP keeps 'unsafe-inline' for scripts and styles because the framework hydrates from inline bootstrap
// scripts and Tailwind/React emit inline styles; everything else is closed (same-origin connect/img/font, no plugins,
// no framing, no base-tag or form-action redirection). The app loads no third-party script, font or image.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Hashed framework assets are public and immutable; every other response may carry a signed-in person's data.
const PUBLIC_ASSET = /^\/(?:_next\/static\/|assets\/|favicon\.ico$)/;

export function securityHeaders(requestUrl: string): Record<string, string> {
  const url = new URL(requestUrl);
  const headers: Record<string, string> = {
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',

    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  // HSTS is meaningful (and only valid) over HTTPS; never advertise it on local http development origins.
  if (url.protocol === 'https:') headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}

/** Returns a copy of the response with the security headers set; private responses are forced to no-store. */
export function withSecurityHeaders(request: Request, response: Response): Response {
  // A protocol switch has no body or mutable headers to protect.
  if (response.status === 101) return response;
  const nullBody = response.status === 204 || response.status === 205 || response.status === 304;
  const secured = new Response(nullBody ? null : response.body, response);
  for (const [name, value] of Object.entries(securityHeaders(request.url))) secured.headers.set(name, value);
  const { pathname } = new URL(request.url);
  const cacheControl = secured.headers.get('Cache-Control') ?? '';
  if (!PUBLIC_ASSET.test(pathname) && !/\bno-store\b/i.test(cacheControl))
    secured.headers.set('Cache-Control', 'no-store');
  return secured;
}
