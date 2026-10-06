// A local, in-process OpenID Connect provider for tests. It is NOT a real identity provider and has no network
// access: it installs a replacement for globalThis.fetch that answers only its own https issuer URLs and records (then
// rejects) every other request, so a test can prove that the application made zero external calls.
//
// It behaves like a strict authorization-code issuer so that the application's side is genuinely checked:
//  - the authorization request must carry response_type=code, scope openid, the registered client_id and redirect_uri,
//    a state, a nonce and an S256 code challenge;
//  - a code is bound to client, redirect URI, challenge and nonce, and is valid for one exchange only;
//  - the token endpoint authenticates the client (basic, post or public) and verifies the PKCE verifier;
//  - id tokens are signed RS256 with a locally generated key published at the JWKS URL.
import { createHash, randomBytes } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const b64url = value => Buffer.from(value).toString('base64url');

export class FakeOidcIssuer {
  constructor({ issuer = 'https://issuer.test.invalid', clientId = 'saha-education-test', clientSecret = 'synthetic-not-a-real-secret',
    redirectUri = 'https://school.test.invalid/api/auth/callback', authMethod = 'client_secret_basic' } = {}) {
    Object.assign(this, { issuer, clientId, clientSecret, redirectUri, authMethod });
    this.kid = 'fake-key-1';
    this.algorithms = ['RS256'];
    this.metadataIssuer = issuer;
    this.codes = new Map();
    this.log = [];            // every request the issuer received, in order
    this.external = [];       // every request to any other host (always refused)
    this.tokenOverrides = {}; // claims to override/add/remove (value undefined removes) in the next id token(s)
    this.tokenMode = null;    // test hooks: 'timeout' | 'error' | 'html' | 'huge' | 'no_token' | 'numeric_token'
    this.discoveryMode = null;// 'timeout' | 'error'
    this.jwksMode = null;
    this.signWith = null;     // alternative signer: { alg, key, kid }
    this.sticky = false;      // keep tokenOverrides for every following token instead of one
  }

  async ready() {
    if (this.keys) return this;
    this.keys = await generateKeyPair('RS256', { extractable: true });
    this.jwk = { ...(await exportJWK(this.keys.publicKey)), kid: this.kid, alg: 'RS256', use: 'sig' };
    return this;
  }

  get endpoints() {
    return { authorize: `${this.issuer}/authorize`, token: `${this.issuer}/token`, jwks: `${this.issuer}/jwks`,
      discovery: `${this.issuer.replace(/\/$/, '')}/.well-known/openid-configuration` };
  }

  /** Configuration the application is given for this issuer. */
  settings() {
    return { SAHA_OIDC_ISSUER: this.issuer, SAHA_OIDC_CLIENT_ID: this.clientId, SAHA_OIDC_REDIRECT_URL: this.redirectUri,
      SAHA_OIDC_CLIENT_SECRET: this.authMethod === 'none' ? '' : this.clientSecret, SAHA_OIDC_TOKEN_AUTH_METHOD: this.authMethod };
  }

  install() {
    this.previousFetch = globalThis.fetch;
    globalThis.fetch = (input, init = {}) => this.handle(input, init);
    return () => { globalThis.fetch = this.previousFetch; };
  }

  count(kind) { return this.log.filter(entry => entry.kind === kind).length; }
  reset() { this.log = []; this.external = []; this.tokenOverrides = {}; this.tokenMode = null; this.discoveryMode = null; this.jwksMode = null; this.signWith = null; this.sticky = false; }

  async handle(input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    const target = url.origin + url.pathname;
    if (url.origin !== new URL(this.issuer).origin) { this.external.push(`${method} ${url.origin}`); throw new TypeError('fetch failed: external network is disabled in tests'); }
    if ((target === this.endpoints.discovery || target === this.endpoints.token) && init.redirect !== 'error') this.log.push({ kind: 'unsafe-redirect-policy' });
    if (target === this.endpoints.discovery && method === 'GET') {
      this.log.push({ kind: 'discovery' });
      if (this.discoveryMode === 'timeout') throw new DOMException('The operation timed out', 'TimeoutError');
      if (this.discoveryMode === 'error') return new Response('unavailable', { status: 503 });
      return Response.json({ issuer: this.metadataIssuer, authorization_endpoint: this.endpoints.authorize, token_endpoint: this.endpoints.token,
        jwks_uri: this.endpoints.jwks, id_token_signing_alg_values_supported: this.algorithms,
        token_endpoint_auth_methods_supported: [this.authMethod] });
    }
    if (target === this.endpoints.jwks && method === 'GET') {
      this.log.push({ kind: 'jwks' });
      if (this.jwksMode === 'timeout') throw new DOMException('The operation timed out', 'TimeoutError');
      return Response.json({ keys: [this.jwk] });
    }
    if (target === this.endpoints.token && method === 'POST') return this.token(init);
    this.log.push({ kind: 'unexpected', target, method });
    return new Response('not found', { status: 404 });
  }

  /** The user agent visiting the authorization endpoint and authenticating a person at the issuer. */
  authorize(authorizationUrl, { subject, claims = {}, deny = false } = {}) {
    const url = new URL(authorizationUrl);
    this.log.push({ kind: 'authorize' });
    const query = Object.fromEntries(url.searchParams);
    const problems = [];
    if (url.origin + url.pathname !== this.endpoints.authorize) problems.push('endpoint');
    if (query.response_type !== 'code') problems.push('response_type');
    if (query.client_id !== this.clientId) problems.push('client_id');
    if (query.redirect_uri !== this.redirectUri) problems.push('redirect_uri');
    if (!String(query.scope ?? '').split(' ').includes('openid')) problems.push('scope');
    if (query.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(query.code_challenge ?? '')) problems.push('pkce');
    if (!query.state || query.state.length < 32) problems.push('state');
    if (!query.nonce || query.nonce.length < 32) problems.push('nonce');
    if (problems.length) throw new Error('Invalid authorization request: ' + problems.join(','));
    const redirect = new URL(this.redirectUri);
    redirect.searchParams.set('state', query.state);
    if (deny) { redirect.searchParams.set('error', 'access_denied'); return { redirectUrl: redirect.toString(), query }; }
    const code = b64url(randomBytes(24));
    this.codes.set(code, { challenge: query.code_challenge, nonce: query.nonce, redirectUri: query.redirect_uri, clientId: query.client_id,
      subject, claims, used: false, createdAt: Date.now() });
    redirect.searchParams.set('code', code);
    return { redirectUrl: redirect.toString(), code, query };
  }

  async token(init) {
    const body = new URLSearchParams(String(init.body ?? ''));
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
    const entry = { kind: 'token', grant: body.get('grant_type'), auth: 'none', redirectUri: body.get('redirect_uri'), verifier: body.get('code_verifier'), ok: false };
    this.log.push(entry);
    if (this.tokenMode === 'timeout') throw new DOMException('The operation timed out', 'TimeoutError');
    const fail = (error, status = 400) => Response.json({ error }, { status });
    let id = body.get('client_id'), secret = body.get('client_secret');
    if (headers.authorization?.startsWith('Basic ')) {
      entry.auth = 'basic';
      const decoded = Buffer.from(headers.authorization.slice(6), 'base64').toString('utf8');
      const split = decoded.indexOf(':');
      const decode = value => decodeURIComponent(value.replaceAll('+', ' '));
      id = decode(decoded.slice(0, split)); secret = decode(decoded.slice(split + 1));
    } else if (secret) entry.auth = 'post'; else if (id) entry.auth = 'public';
    const expectedAuth = { client_secret_basic: 'basic', client_secret_post: 'post', none: 'public' }[this.authMethod];
    if (entry.auth !== expectedAuth || id !== this.clientId || (this.authMethod !== 'none' && secret !== this.clientSecret)) return fail('invalid_client', 401);
    if (entry.grant !== 'authorization_code') return fail('unsupported_grant_type');
    const record = this.codes.get(body.get('code') ?? '');
    if (!record) return fail('invalid_grant');
    if (record.used) { entry.replay = true; return fail('invalid_grant'); }
    record.used = true; // one exchange only, even when a later check fails
    if (record.redirectUri !== body.get('redirect_uri') || record.clientId !== id) return fail('invalid_grant');
    const verifier = body.get('code_verifier') ?? '';
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier) || createHash('sha256').update(verifier).digest('base64url') !== record.challenge) return fail('invalid_grant');
    entry.ok = true;
    if (this.tokenMode === 'error') return new Response('boom', { status: 500 });
    if (this.tokenMode === 'html') return new Response('<html>not json</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    if (this.tokenMode === 'huge') return new Response(JSON.stringify({ id_token: 'x'.repeat(70000) }), { status: 200 });
    if (this.tokenMode === 'no_token') return Response.json({ access_token: 'a' });
    if (this.tokenMode === 'numeric_token') return Response.json({ id_token: 12345 });
    const idToken = await this.sign(record);
    if (!this.sticky) this.tokenOverrides = {};
    return Response.json({ id_token: idToken, token_type: 'Bearer', access_token: 'synthetic-access-token-not-used' });
  }

  async sign(record) {
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: this.issuer, aud: this.clientId, sub: record.subject, nonce: record.nonce, iat: now, exp: now + 300, ...record.claims };
    for (const [key, value] of Object.entries(this.tokenOverrides)) { if (value === undefined) delete claims[key]; else claims[key] = value; }
    const signer = this.signWith ?? { alg: 'RS256', key: this.keys.privateKey, kid: this.kid };
    const jwt = new SignJWT(claims).setProtectedHeader({ alg: signer.alg, kid: signer.kid });
    return jwt.sign(signer.key);
  }
}

/** A browser cookie jar that applies Set-Cookie headers like a browser would for a Secure, host-only cookie. */
export class CookieJar {
  constructor() { this.cookies = new Map(); this.attributes = new Map(); }
  apply(response) {
    for (const header of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attributes] = header.split(';').map(part => part.trim());
      const index = pair.indexOf('='); const name = pair.slice(0, index); const value = pair.slice(index + 1);
      const maxAge = attributes.find(attribute => /^max-age=/i.test(attribute));
      if (maxAge && Number(maxAge.split('=')[1]) <= 0) { this.cookies.delete(name); this.attributes.delete(name); } else { this.cookies.set(name, value); this.attributes.set(name, attributes); }
    }
  }
  header() { return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '); }
  get(name) { return this.cookies.get(name); }
  set(name, value) { this.cookies.set(name, value); }
  delete(name) { this.cookies.delete(name); }
}
