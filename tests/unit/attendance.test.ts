import { test } from 'node:test';
import * as assert from 'node:assert';
import { attendancePercentage } from '@/lib/education/attendance';

test('attendancePercentage calculates correct percentage for present and late', async () => {
  const records = [
    { status: 'present' },
    { status: 'late' },
    { status: 'absent' }
  ];
  
  const percentage = attendancePercentage(records);
  assert.equal(percentage, 66.67, 'Should calculate 2 out of 3 as 66.67%');
});

test('attendancePercentage calculates correct percentage for all present', async () => {
  const records = [
    { status: 'present' },
    { status: 'present' },
    { status: 'present' }
  ];
  
  const percentage = attendancePercentage(records);
  assert.equal(percentage, 100, 'Should calculate 3 out of 3 as 100%');
});

test('attendancePercentage calculates correct percentage for all absent', async () => {
  const records = [
    { status: 'absent' },
    { status: 'absent' },
    { status: 'absent' }
  ];
  
  const percentage = attendancePercentage(records);
  assert.equal(percentage, 0, 'Should calculate 0 out of 3 as 0%');
});

test('attendancePercentage handles empty array', async () => {
  const records = [];
  
  const percentage = attendancePercentage(records);
  assert.equal(percentage, 0, 'Should return 0 for empty array');
});

test('attendancePercentage calculates correct percentage with mixed statuses', async () => {
  const records = [
    { status: 'present' },
    { status: 'absent' },
    { status: 'late' },
    { status: 'present' }
  ];
  
  const percentage = attendancePercentage(records);
  assert.equal(percentage, 75, 'Should calculate 3 out of 4 as 75%');
});