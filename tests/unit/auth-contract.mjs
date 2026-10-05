const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// Set up the proper module resolution for testing
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
    let s = spec; if (s.startsWith('@/')) s = pathToFileURL(join(root, s.slice(2))).href;
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

// Import auth functions after hooks are registered
const { getPrincipal, requirePrincipal, requireRole, DEMO_USERS } = await import(pathToFileURL(join(root, 'lib/education/auth.ts')).href);

import assert from 'node:assert/strict';

// Test 1: No request should return null
test('getPrincipal with no request returns null', () => {
  const result = getPrincipal();
  assert.equal(result, null);
});

// Test 2: Cookie with valid role should return the corresponding user
test('getPrincipal with valid demo role cookie returns correct user', () => {
  for (const [role, expectedUser] of Object.entries(DEMO_USERS)) {
    const mockRequest = {
      headers: {
        get: (name) => name === 'Cookie' ? `saha_demo_role=${role}` : null
      }
    };
    
    const result = getPrincipal(mockRequest);
    assert.equal(result, expectedUser);
  }
});

// Test 3: Cookie with invalid role should return null
test('getPrincipal with invalid demo role cookie returns null', () => {
  const mockRequest = {
    headers: {
      get: (name) => name === 'Cookie' ? 'saha_demo_role=invalid-role' : null
    }
  };
  
  const result = getPrincipal(mockRequest);
  assert.equal(result, null);
});

// Test 4: Cookie with no role should return null
test('getPrincipal with no role in cookie returns null', () => {
  const mockRequest = {
    headers: {
      get: (name) => name === 'Cookie' ? 'other_cookie=value' : null
    }
  };
  
  const result = getPrincipal(mockRequest);
  assert.equal(result, null);
});

// Test 5: Cookie with other cookies present should still work
test('getPrincipal with other cookies present still works', () => {
  const mockRequest = {
    headers: {
      get: (name) => name === 'Cookie' ? 'other_cookie=value; saha_demo_role=teacher; another_cookie=123' : null
    }
  };
  
  const result = getPrincipal(mockRequest);
  assert.equal(result, DEMO_USERS.teacher);
});

// Test 6: requireRole should allow correct role and throw for incorrect one
test('requireRole allows correct role and throws for incorrect one', () => {
  const adminUser = DEMO_USERS.admin;
  
  // Should not throw for correct role
  assert.doesNotThrow(() => {
    requireRole(adminUser, 'admin');
  });
  
  // Should throw for incorrect role
  assert.throws(() => {
    requireRole(adminUser, 'teacher');
  }, /Role teacher required/);
});

// Test 7: requirePrincipal should throw when no session
test('requirePrincipal throws when no session', () => {
  const mockRequest = {
    headers: {
      get: (name) => name === 'Cookie' ? null : null
    }
  };
  
  assert.throws(() => {
    requirePrincipal(mockRequest);
  }, /Authentication required/);
});

// Test 8: requirePrincipal should not throw when session exists
test('requirePrincipal does not throw when session exists', () => {
  const mockRequest = {
    headers: {
      get: (name) => name === 'Cookie' ? 'saha_demo_role=student' : null
    }
  };
  
  // Should not throw for valid session
  assert.doesNotThrow(() => {
    requirePrincipal(mockRequest);
  });
});

// Run all tests
let passed = 0;
let failed = 0;

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
    passed++;
  } catch (err) {
    console.log(`not ok - ${name}: ${err.message}`);
    failed++;
  }
}

console.log(JSON.stringify({ passed, failed, skipped: 0 }));
process.exitCode = failed ? 1 : 0;