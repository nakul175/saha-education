const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// Import with resolve hook setup as per test documentation
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
  for (const f of readdirSync(join(root, 'drizzle')).filter((f) => /^\d.*\.sql$/.test(f)).sort()) 
    for (const st of readFileSync(join(root, 'drizzle', f), 'utf8').split('--> statement-breakpoint')) 
      if (st.trim()) sqlite.exec(st);
  return sqlite;
}

const { drizzle } = await import('drizzle-orm/sqlite-proxy');
const schema = await import(pathToFileURL(join(root, 'db/schema.ts')).href);

function useDb(sqlite) {
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

// Import assertions
import assert from 'node:assert/strict';

// Direct import of the roles module
const rolesModule = await import(pathToFileURL(join(root, 'lib/education/roles.ts')).href);
const { ROLES, canRead, canWrite, canDelete } = rolesModule;

// Test that ROLES contains exactly admin, teacher, guardian and student
test('ROLES contains exactly admin, teacher, guardian and student', () => {
  assert.equal(ROLES.length, 4);
  
  const expectedRoles = ['admin', 'teacher', 'guardian', 'student'];
  for (const role of expectedRoles) {
    assert.ok(ROLES.includes(role), `Missing role: ${role}`);
  }
});

// Table-driven checks of every exported permission helper for every role
const PERMISSION_TESTS = [
  // [role, canRead, canWrite, canDelete]
  ['admin', true, true, true],
  ['teacher', true, true, false],
  ['guardian', true, true, false],
  ['student', true, false, false],
];

for (const [role, expectedRead, expectedWrite, expectedDelete] of PERMISSION_TESTS) {
  test(`canRead for ${role}`, () => {
    assert.equal(canRead(role), expectedRead);
  });
  
  test(`canWrite for ${role}`, () => {
    assert.equal(canWrite(role), expectedWrite);
  });
  
  test(`canDelete for ${role}`, () => {
    assert.equal(canDelete(role), expectedDelete);
  });
}

// Test negative cases - ensure no unexpected roles can perform actions
test('Guardian cannot delete', () => {
  assert.equal(canDelete('guardian'), false);
});

test('Student cannot write or delete', () => {
  assert.equal(canWrite('student'), false);
  assert.equal(canDelete('student'), false);
});

let passed = 0;
let failed = 0;

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
    passed++;
  } catch (err) {
    console.log(`not ok - ${name}: ${err.message}`);
    failed++;
  }
}

console.log(JSON.stringify({ passed, failed, skipped: 0 }));
process.exitCode = failed ? 1 : 0;