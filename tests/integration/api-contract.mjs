const tests = [];
const test = (name, fn) => tests.push({ name, fn });
import assert from 'node:assert/strict';

import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('../../', import.meta.url));  // repo root (test files live in tests/<layer>/)

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === '@/db' || spec === '@/db/index') return { url: 'data:text/javascript,export const getDb = () => globalThis.__sahaTestDb;', shortCircuit: true };
    if (/^next\/[a-z-]+$/.test(spec)) return next(spec + '.js', ctx);
    let s = spec;
    if (s.startsWith('@/')) s = pathToFileURL(join(root, s.slice(2))).href;
    if ((s.startsWith('.') || s.startsWith('file:')) && !/\.[cm]?[jt]sx?$/.test(s)) {
      const base = new URL(s, ctx.parentURL);
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        const u = new URL(base.href + ext);
        if (existsSync(u)) return { url: u.href, shortCircuit: true };
      }
    }
    return next(s, ctx);
  }
});

function freshDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync(join(root, 'drizzle')).filter((f) => /^\d.*\.sql$/.test(f)).sort()) {
    for (const st of readFileSync(join(root, 'drizzle', f), 'utf8').split('--> statement-breakpoint')) {
      if (st.trim()) sqlite.exec(st);
    }
  }
  return sqlite;
}

const { drizzle } = await import('drizzle-orm/sqlite-proxy');
const schema = await import(pathToFileURL(join(root, 'db/schema.ts')).href);

function installTestDb(sqlite) {
  globalThis.__sahaTestDb = drizzle(async (sql, params, method) => {
    const st = sqlite.prepare(sql);
    if (method === 'run') {
      st.run(...params);
      return { rows: [] };
    }
    if (method === 'get') {
      const r = st.get(...params);
      return { rows: r ? Object.values(r) : undefined };
    }
    return { rows: st.all(...params).map((r) => Object.values(r)) };
  }, { schema });
}

let sqlite = freshDb();
installTestDb(sqlite);

// Import after hooks are set up
const auth = await import(pathToFileURL(join(root, 'lib/education/auth.ts')).href);
const schools = await import(pathToFileURL(join(root, 'lib/education/schools.ts')).href);
const students = await import(pathToFileURL(join(root, 'lib/education/students.ts')).href);
const courses = await import(pathToFileURL(join(root, 'lib/education/courses.ts')).href);

// Test 1: POST /api/session with valid admin role returns 200, principal and Set-Cookie
test('POST /api/session with valid admin role', async () => {
  const request = new Request('http://localhost/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' })
  });

  const response = await (await import(pathToFileURL(join(root, 'app/api/session/route.ts')).href)).POST(request);
  const data = await response.json();
  
  assert.equal(response.status, 200, `Expected status 200, got ${response.status}`);
  assert.ok(data.id, 'Response should have an id');
  assert.ok(data.role, 'Response should have a role');
  assert.ok(response.headers.get('Set-Cookie'), 'Response should have Set-Cookie header');
  assert.equal(data.role, 'admin', `Expected role admin, got ${data.role}`);
});

// Test 2: POST /api/session with invalid role returns 400
test('POST /api/session with invalid role', async () => {
  const request = new Request('http://localhost/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'invalid-role' })
  });

  const response = await (await import(pathToFileURL(join(root, 'app/api/session/route.ts')).href)).POST(request);
  
  assert.equal(response.status, 400, `Expected status 400, got ${response.status}`);
});

// Test 3: DELETE /api/session clears the cookie
test('DELETE /api/session clears cookie', async () => {
  const request = new Request('http://localhost/api/session', {
    method: 'DELETE',
  });

  const response = await (await import(pathToFileURL(join(root, 'app/api/session/route.ts')).href)).DELETE(request);
  
  const cookieHeader = response.headers.get('Set-Cookie');
  assert.ok(cookieHeader, 'Response should have Set-Cookie header');
  assert.ok(cookieHeader.includes('Max-Age=0'), 'Cookie should be cleared');
});

// Test 4: GET /api/session without a cookie returns 401
test('GET /api/session without cookie returns 401', async () => {
  const request = new Request('http://localhost/api/session', {
    method: 'GET',
  });

  const response = await (await import(pathToFileURL(join(root, 'app/api/session/route.ts')).href)).GET(request);
  
  assert.equal(response.status, 401, `Expected status 401, got ${response.status}`);
});

// Test 5: GET /api/session with a valid cookie returns the principal
test('GET /api/session with valid cookie', async () => {
  // First set a session cookie
  const postRequest = new Request('http://localhost/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' })
  });

  let response = await (await import(pathToFileURL(join(root, 'app/api/session/route.ts')).href)).POST(postRequest);
  
  const cookieHeader = response.headers.get('Set-Cookie');
  assert.ok(cookieHeader, 'No Set-Cookie header found');

  // Use the cookie to make a GET request
  const getRequest = new Request('http://localhost/api/session', {
    method: 'GET',
    headers: { 
      'Cookie': cookieHeader.split(';')[0] // Extract just the cookie value
    }
  });

  response = await (await import(pathToFileURL(join(root, 'app/api/session/route.ts')).href)).GET(getRequest);

  assert.equal(response.status, 200, `Expected status 200, got ${response.status}`);
  
  const data = await response.json();
  assert.equal(data.role, 'admin', `Expected role admin, got ${data.role}`);
});

// Test 6: Protected routes return 401 without a cookie
test('Protected routes return 401 without cookie', async () => {
  const request = new Request('http://localhost/api/schools', {
    method: 'GET'
  });

  const response = await (await import(pathToFileURL(join(root, 'app/api/schools/route.ts')).href)).GET(request);
  
  assert.equal(response.status, 401, `Expected status 401, got ${response.status}`);
});

// Test 7: With an admin cookie, creating a school and listing schools returns it
test('Admin can create and list schools', async () => {
  // First set a session cookie
  const postRequest = new Request('http://localhost/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' })
  });

  let response = await (await import(pathToFileURL(join(root, 'app/api/session/route.ts')).href)).POST(postRequest);
  
  const cookieHeader = response.headers.get('Set-Cookie');
  assert.ok(cookieHeader, 'No Set-Cookie header found');

  // Create a school with the admin session
  const createRequest = new Request('http://localhost/api/schools', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cookie': cookieHeader.split(';')[0]
    },
    body: JSON.stringify({
      name: 'Test School',
      address: '123 Test St'
    })
  });

  response = await (await import(pathToFileURL(join(root, 'app/api/schools/route.ts')).href)).POST(createRequest);
  
  assert.equal(response.status, 201, `Expected status 201 for creating school, got ${response.status}`);

  // List schools to check it was created
  const listRequest = new Request('http://localhost/api/schools', {
    method: 'GET',
    headers: { 
      'Cookie': cookieHeader.split(';')[0]
    }
  });

  response = await (await import(pathToFileURL(join(root, 'app/api/schools/route.ts')).href)).GET(listRequest);
  
  assert.equal(response.status, 200, `Expected status 200 for listing schools, got ${response.status}`);

  const data = await response.json();
  assert.ok(Array.isArray(data), 'Response should be an array');
  assert.ok(data.length > 0, 'Should have at least one school');
  assert.equal(data[0].name, 'Test School', 'Created school not found in list');
});

// Test 8: Invalid bodies return 400
test('Invalid bodies return 400', async () => {
  // First set a session cookie
  const postRequest = new Request('http://localhost/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' })
  });

  let response = await (await import(pathToFileURL(join(root, 'app/api/session/route.ts')).href)).POST(postRequest);
  
  const cookieHeader = response.headers.get('Set-Cookie');
  assert.ok(cookieHeader, 'No Set-Cookie header found');

  // Try to create a school with invalid data
  const createRequest = new Request('http://localhost/api/schools', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cookie': cookieHeader.split(';')[0]
    },
    body: JSON.stringify({
      // Missing required fields
    })
  });

  response = await (await import(pathToFileURL(join(root, 'app/api/schools/route.ts')).href)).POST(createRequest);
  
  assert.equal(response.status, 400, `Expected status 400 for invalid body, got ${response.status}`);
});

// Run tests
let passed = 0;
let failed = 0;

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
    passed++;
  } catch (error) {
    console.log(`not ok - ${name}: ${error.message}`);
    failed++;
  }
}

console.log(JSON.stringify({ passed, failed, skipped: 0 }));
process.exitCode = failed ? 1 : 0;