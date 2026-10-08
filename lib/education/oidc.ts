import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { getDb } from '@/db';
import { authRateLimits, oidcTransactions, users } from '@/db/schema';
import {
  allowedOrigins,
  AuthError,
  cookie,
  digest,
  httpsUrl,
  randomToken,
  secureCookie,
  setting,
} from './identity';
import { createSession, revokeSession } from './session';

export const TRANSACTION_COOKIE = '__Host-saha_oidc';
const TRANSACTION_SECONDS = 300;
const ALGORITHMS = ['RS256', 'PS256', 'ES256', 'EdDSA'];
type TokenAuthMethod = 'client_secret_basic' | 'client_secret_post' | 'none';
export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
  tokenAuthMethod: TokenAuthMethod;
};
type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  id_token_signing_alg_values_supported: string[];
  token_endpoint_auth_methods_supported?: string[];
};

export function oidcConfig(): OidcConfig {
  const issuer = setting('SAHA_OIDC_ISSUER');
  const clientId = setting('SAHA_OIDC_CLIENT_ID');
  const clientSecret = setting('SAHA_OIDC_CLIENT_SECRET');
  const redirectUrl = setting('SAHA_OIDC_REDIRECT_URL');
  if (!issuer || !clientId || !redirectUrl) throw new AuthError('Sign-in has not been configured', 503);
  const issuerUrl = httpsUrl(issuer);
  const callback = httpsUrl(redirectUrl);
  if (
    issuerUrl.search ||
    callback.search ||
    callback.pathname !== '/api/auth/callback' ||
    !allowedOrigins().has(callback.origin)
  ) {
    throw new AuthError('Invalid identity configuration', 503);
  }
  const tokenAuthMethod =
    setting('SAHA_OIDC_TOKEN_AUTH_METHOD') || (clientSecret ? 'client_secret_basic' : 'none');
  if (
    !['client_secret_basic', 'client_secret_post', 'none'].includes(tokenAuthMethod) ||
    (tokenAuthMethod !== 'none' && !clientSecret)
  )
    throw new AuthError('Invalid identity configuration', 503);
  return { issuer, clientId, clientSecret, redirectUrl, tokenAuthMethod: tokenAuthMethod as TokenAuthMethod };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new AuthError('Identity service unavailable', 503);
  if (Number(response.headers.get('content-length') || 0) > 65536)
    throw new AuthError('Invalid identity response', 503);
  const text = await response.text();
  if (text.length > 65536) throw new AuthError('Invalid identity response', 503);
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AuthError('Invalid identity response', 503);
  return value;
}

export async function discover(config: OidcConfig): Promise<Discovery> {
  const response = await fetch(`${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/json' },
  });
  const metadata = await readJson(response);
  if (metadata.issuer !== config.issuer) throw new AuthError('Invalid identity issuer', 503);
  for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    if (typeof metadata[key] !== 'string') throw new AuthError('Invalid identity configuration', 503);
    httpsUrl(metadata[key] as string);
  }
  if (
    !Array.isArray(metadata.id_token_signing_alg_values_supported) ||
    !metadata.id_token_signing_alg_values_supported.some((value) => ALGORITHMS.includes(value))
  ) {
    throw new AuthError('Unsupported identity signing algorithm', 503);
  }
  const methods = metadata.token_endpoint_auth_methods_supported ?? ['client_secret_basic'];
  if (!Array.isArray(methods) || !methods.includes(config.tokenAuthMethod))
    throw new AuthError('Unsupported identity client authentication', 503);
  return metadata as unknown as Discovery;
}

async function limitLogin(request: Request): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const window = 600000;
  // CF-Connecting-IP is supplied by the Cloudflare edge; a missing value uses a shared restrictive bucket.
  const bucket = `login:${Math.floor(now / window)}:${await digest(request.headers.get('cf-connecting-ip') || 'unknown')}`;
  await db.delete(authRateLimits).where(lt(authRateLimits.expiresAt, now));
  const [row] = await db
    .insert(authRateLimits)
    .values({ bucket, count: 1, expiresAt: now + window })
    .onConflictDoUpdate({ target: authRateLimits.bucket, set: { count: sql`${authRateLimits.count} + 1` } })
    .returning({ count: authRateLimits.count });
  if (!row || row.count > 20) throw new AuthError('Too many sign-in attempts; try again later', 429);
}

export async function startLogin(request: Request): Promise<Response> {
  const config = oidcConfig();
  await limitLogin(request);
  const metadata = await discover(config);
  const state = randomToken();
  const browser = randomToken();
  const verifier = randomToken();
  const nonce = randomToken();
  const now = Date.now();
  const db = getDb();
  await db.delete(oidcTransactions).where(lt(oidcTransactions.expiresAt, now));
  await db.insert(oidcTransactions).values({
    stateHash: await digest(state),
    browserHash: await digest(browser),
    verifier,
    nonce,
    expiresAt: now + TRANSACTION_SECONDS * 1000,
  });
  const url = new URL(metadata.authorization_endpoint);
  for (const [key, value] of Object.entries({
    response_type: 'code',
    scope: 'openid',
    client_id: config.clientId,
    redirect_uri: config.redirectUrl,
    state,
    nonce,
    code_challenge: await digest(verifier),
    code_challenge_method: 'S256',
  }))
    url.searchParams.set(key, value);
  return Response.json(
    { url: url.toString() },
    {
      headers: {
        'Set-Cookie': secureCookie(TRANSACTION_COOKIE, browser, TRANSACTION_SECONDS),
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
}

export function validateIdentityClaims(payload: JWTPayload, config: OidcConfig, nonce: string): string {
  if (
    payload.nonce !== nonce ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    payload.sub.length > 255 ||
    typeof payload.iat !== 'number' ||
    payload.iat > Math.floor(Date.now() / 1000) + 30
  ) {
    throw new AuthError('Invalid identity token', 401);
  }
  if (
    (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId) ||
    (payload.azp !== undefined && payload.azp !== config.clientId)
  )
    throw new AuthError('Invalid identity audience', 401);
  return payload.sub;
}

export async function finishLogin(request: Request): Promise<Response> {
  const config = oidcConfig();
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const browser = cookie(request, TRANSACTION_COOKIE);
  if (
    !state ||
    !/^[A-Za-z0-9_-]{43}$/.test(state) ||
    !browser ||
    url.searchParams.getAll('state').length !== 1 ||
    url.searchParams.getAll('code').length > 1
  ) {
    throw new AuthError('Invalid sign-in transaction', 401);
  }
  // Atomic DELETE RETURNING consumes one matching browser-bound transaction exactly once.
  const [transaction] = await getDb()
    .delete(oidcTransactions)
    .where(
      and(
        eq(oidcTransactions.stateHash, await digest(state)),
        eq(oidcTransactions.browserHash, await digest(browser)),
        gt(oidcTransactions.expiresAt, Date.now()),
      ),
    )
    .returning();
  if (!transaction) throw new AuthError('Expired or invalid sign-in transaction', 401);
  const code = url.searchParams.get('code');
  if (url.searchParams.has('error') || !code || code.length > 4096)
    throw new AuthError('Sign-in was not completed', 401);
  const metadata = await discover(config);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUrl,
    code_verifier: transaction.verifier,
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  if (config.tokenAuthMethod === 'client_secret_basic') {
    const encode = (value: string) => encodeURIComponent(value).replace(/%20/g, '+');
    headers.Authorization = `Basic ${btoa(`${encode(config.clientId)}:${encode(config.clientSecret)}`)}`;
  } else {
    body.set('client_id', config.clientId);
    if (config.tokenAuthMethod === 'client_secret_post') body.set('client_secret', config.clientSecret);
  }
  const tokens = await readJson(
    await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    }),
  );
  if (typeof tokens.id_token !== 'string' || tokens.id_token.length > 32768)
    throw new AuthError('Invalid identity token', 401);
  const jwks = createRemoteJWKSet(new URL(metadata.jwks_uri), { timeoutDuration: 10000 });
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: config.issuer,
    audience: config.clientId,
    algorithms: metadata.id_token_signing_alg_values_supported.filter((value) => ALGORITHMS.includes(value)),
    requiredClaims: ['iss', 'aud', 'exp', 'iat', 'sub', 'nonce'],
    clockTolerance: 30,
  });
  const subject = validateIdentityClaims(payload, config, transaction.nonce);
  const [user] = await getDb()
    .select()
    .from(users)
    .where(and(eq(users.identityIssuer, config.issuer), eq(users.identitySubject, subject)))
    .limit(1);
  if (
    !user ||
    user.disabledAt ||
    !user.schoolId ||
    !['admin', 'teacher', 'guardian', 'student'].includes(user.role)
  ) {
    throw new AuthError('This account has not been provisioned for this school', 403);
  }
  await revokeSession(request);
  const sessionCookie = await createSession(user.id);
  const response = new Response(null, {
    status: 303,
    headers: { Location: '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
  response.headers.append('Set-Cookie', sessionCookie);
  response.headers.append('Set-Cookie', secureCookie(TRANSACTION_COOKIE, '', 0));
  response.headers.append('Set-Cookie', 'saha_demo_role=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return response;
}
