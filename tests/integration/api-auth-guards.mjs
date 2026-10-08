import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
class AccessError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
  }
}
class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}
let principal = null;
let deniedOrigin = false;
let serviceError = null;
let calls = 0;
const auth = {
  AuthError,
  getPrincipal: async () => principal,
  requireSameOrigin: () => {
    if (deniedOrigin) throw new AuthError('private origin detail', 403);
  },
};
const access = { AccessError, assertAdmin() {}, assertPrincipal() {} };
const cache = new Map();
function load(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path);
  const loaded = { exports: {} };
  cache.set(path, loaded.exports);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  function dependency(name) {
    if (name === './auth') return auth;
    if (name === './access' || name === '@/lib/education/access') return access;
    if (name === '@/lib/education/http') return load('lib/education/http.ts');
    if (name === '@/lib/education/validation') return load('lib/education/validation.ts');
    // The record routes share one real wrapper (authentication, administrator check, safe 409/400 mapping); it is loaded
    // for real so the anonymous/cross-origin assertions below exercise it rather than a stub.
    if (name === '@/lib/education/record-support') return load('lib/education/record-support.ts');
    if (name === './http') return load('lib/education/http.ts');
    if (name === './calendar-date' || name === './stored-timestamp')
      return load('lib/education/' + name.slice(2) + '.ts');
    if (name.startsWith('@/lib/education/'))
      return new Proxy(
        {},
        {
          get: () => async () => {
            calls++;
            if (serviceError) throw serviceError;
            return [];
          },
        },
      );
    if (name.startsWith('@/db/')) return {};
    return require(name);
  }
  new Function('require', 'module', 'exports', code)(dependency, loaded, loaded.exports);
  cache.set(path, loaded.exports);
  return loaded.exports;
}
function routes(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const next = join(path, entry.name);
    // Demo entry has a separate actual-D1 default-off/fixed-identity contract
    // (synthetic-demo-contract.mjs); it is not a protected school-record API.
    if (entry.isDirectory()) return ['auth', 'session', 'demo'].includes(entry.name) ? [] : routes(next);
    return entry.name === 'route.ts' ? [next] : [];
  });
}
const context = { params: Promise.resolve({ id: 'synthetic-id' }) };
let count = 0;
for (const path of routes('app/api')) {
  const handlers = load(path);
  for (const [method, handler] of Object.entries(handlers)) {
    if (typeof handler !== 'function') continue;
    principal = null;
    calls = 0;
    const request = new Request('https://education.example/api/test', { method });
    const response = await handler(request, context);
    assert.equal(response.status, 401, `${path} ${method} requires authentication`);
    assert.equal(calls, 0, `${path} ${method} accesses no records anonymously`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    count++;
    if (method !== 'GET') {
      principal = { id: 'synthetic-admin', role: 'admin', schoolId: 'synthetic-school' };
      deniedOrigin = true;
      const denied = await handler(request, context);
      assert.equal(denied.status, 403, `${path} ${method} rejects cross-origin writes`);
      assert.equal(calls, 0, `${path} ${method} accesses no records before origin check`);
      deniedOrigin = false;
      count++;
    }
  }
}
principal = { id: 'synthetic-admin', role: 'admin', schoolId: 'synthetic-school' };
const course = load('app/api/courses/[id]/route.ts');
for (const status of [400, 403, 404]) {
  serviceError = new AccessError('private database detail', status);
  const response = await course.GET(new Request('https://education.example/api/courses/test'), context);
  assert.equal(response.status, status);
  assert.equal(JSON.stringify(await response.json()).includes('private'), false);
  count++;
}
serviceError = new Error('private database detail');
const failed = await course.GET(new Request('https://education.example/api/courses/test'), context);
assert.equal(failed.status, 500);
assert.deepEqual(await failed.json(), { error: 'Internal server error' });
count++;
serviceError = null;
const invalid = await course.PATCH(
  new Request('https://education.example/api/courses/test', { method: 'PATCH', body: '{invalid' }),
  context,
);
assert.equal(invalid.status, 400);
count++;
console.log(
  `API authentication and origin guards: ${count} checks passed (isolated handler harness; no live provider or database).`,
);

console.log(JSON.stringify({ passed: count, failed: 0, skipped: 0 }));
