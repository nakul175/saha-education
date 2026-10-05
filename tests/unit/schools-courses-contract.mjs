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

// Import the modules after setting up DB
const schools = await import(pathToFileURL(join(root, 'lib/education/schools.ts')).href);
const courses = await import(pathToFileURL(join(root, 'lib/education/courses.ts')).href);

// Test schools
test('create school returns stored row with id and timestamps', async () => {
  const schoolData = {
    name: 'Test School',
    address: '123 Test St'
  };
  
  const createdSchool = await schools.createSchool(schoolData);
  
  // Check that it has the required fields
  assert.ok(createdSchool.id, 'School should have an id');
  assert.ok(createdSchool.createdAt, 'School should have createdAt timestamp');
  assert.ok(createdSchool.updatedAt, 'School should have updatedAt timestamp');
  
  // Verify data matches
  assert.equal(createdSchool.name, schoolData.name, 'School name does not match');
  assert.equal(createdSchool.address, schoolData.address, 'School address does not match');
});

test('get school by id returns correct school', async () => {
  const schoolData = { name: 'Test School 2', address: '456 Test Ave' };
  const createdSchool = await schools.createSchool(schoolData);
  
  const retrievedSchool = await schools.getSchool(createdSchool.id);
  
  assert.ok(retrievedSchool, 'School should be found');
  assert.equal(retrievedSchool.name, schoolData.name, 'Retrieved school name does not match');
  assert.equal(retrievedSchool.address, schoolData.address, 'Retrieved school address does not match');
});

test('get unknown school returns null', async () => {
  const result = await schools.getSchool('non-existent-id');
  assert.equal(result, null, 'Should return null for unknown school id');
});

test('update school changes fields and updates updatedAt', async () => {
  const originalSchool = await schools.createSchool({ name: 'Original School', address: '1 Test St' });
  const originalUpdatedAt = originalSchool.updatedAt;
  
  // Wait a bit to ensure time difference
  await new Promise(resolve => setTimeout(resolve, 10));
  
  const updatedSchool = await schools.updateSchool(originalSchool.id, { 
    name: 'Updated School', 
    address: '2 Updated St' 
  });
  
  assert.ok(updatedSchool, 'Should update school');
  assert.equal(updatedSchool.name, 'Updated School', 'Name should be updated');
  assert.equal(updatedSchool.address, '2 Updated St', 'Address should be updated');
  assert.ok(updatedSchool.updatedAt !== originalUpdatedAt, 'updatedAt should be updated');
});

// Test courses
test('create course returns stored row with id and timestamps', async () => {
  const school = await schools.createSchool({ name: 'Test School for Courses', address: '789 Test Rd' });
  
  const courseData = {
    schoolId: school.id,
    code: 'MATH101',
    title: 'Mathematics 101',
    gradeLevel: 'Grade 10'
  };
  
  const createdCourse = await courses.createCourse(courseData);
  
  // Check that it has the required fields
  assert.ok(createdCourse.id, 'Course should have an id');
  assert.ok(createdCourse.createdAt, 'Course should have createdAt timestamp');
  assert.ok(createdCourse.updatedAt, 'Course should have updatedAt timestamp');
  
  // Verify data matches - only check required fields to prevent schema issues
  assert.equal(createdCourse.schoolId, courseData.schoolId, 'Course schoolId does not match');
  assert.equal(createdCourse.code, courseData.code, 'Course code does not match');
  assert.equal(createdCourse.title, courseData.title, 'Course title does not match');
  assert.equal(createdCourse.gradeLevel, courseData.gradeLevel, 'Course gradeLevel does not match');
});

test('get course by id returns correct course', async () => {
  const school = await schools.createSchool({ name: 'Test School for Courses 2', address: '101 Test Rd' });
  
  const courseData = { 
    schoolId: school.id,
    code: 'SCI201',
    title: 'Science 201',
    gradeLevel: 'Grade 11'
  };
  
  const createdCourse = await courses.createCourse(courseData);
  
  const retrievedCourse = await courses.getCourse(createdCourse.id);
  
  assert.ok(retrievedCourse, 'Course should be found');
  assert.equal(retrievedCourse.code, courseData.code, 'Retrieved course code does not match');
  assert.equal(retrievedCourse.title, courseData.title, 'Retrieved course title does not match');
});

test('get unknown course returns null', async () => {
  const result = await courses.getCourse('non-existent-id');
  assert.equal(result, null, 'Should return null for unknown course id');
});

// Run the tests
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