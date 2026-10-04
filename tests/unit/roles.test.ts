import { test } from 'node:test';
import * as assert from 'node:assert';
import { canRead, canWrite, canDelete, ROLES } from '@/lib/education/roles';

test('roles array contains expected roles', async () => {
  assert.ok(ROLES.includes('admin'), 'ROLES should include admin');
  assert.ok(ROLES.includes('teacher'), 'ROLES should include teacher');
  assert.ok(ROLES.includes('guardian'), 'ROLES should include guardian');
  assert.ok(ROLES.includes('student'), 'ROLES should include student');
});

test('canRead returns true for all roles', async () => {
  ROLES.forEach(role => {
    assert.ok(canRead(role), `All roles should be able to read, but ${role} cannot`);
  });
});

test('canWrite returns false for student role', async () => {
  assert.ok(!canWrite('student'), 'Student should not be able to write');
});

test('canWrite returns true for non-student roles', async () => {
  const rolesThatCanWrite = ['admin', 'teacher', 'guardian'];
  rolesThatCanWrite.forEach(role => {
    assert.ok(canWrite(role), `${role} should be able to write`);
  });
});

test('canDelete returns true only for admin role', async () => {
  assert.ok(canDelete('admin'), 'Admin should be able to delete');
  assert.ok(!canDelete('teacher'), 'Teacher should not be able to delete');
  assert.ok(!canDelete('guardian'), 'Guardian should not be able to delete');
  assert.ok(!canDelete('student'), 'Student should not be able to delete');
});