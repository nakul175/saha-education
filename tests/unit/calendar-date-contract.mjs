import assert from 'node:assert/strict';
import { isExactCalendarDate } from '../../lib/education/calendar-date.ts';
let passed = 0;
for (const value of [
  '2026-10-05',
  '2024-02-29',
  '2000-02-29',
  '1900-02-28',
  '2026-12-31',
  '0000-01-01',
  '9999-12-31',
]) {
  assert.equal(isExactCalendarDate(value), true, 'Valid stored calendar day: ' + value);
  passed++;
}
for (const value of [
  '2026-02-29',
  '1900-02-29',
  '2026-02-30',
  '2026-04-31',
  '2026-00-01',
  '2026-13-01',
  '2026-01-00',
  '2026-01-32',
  '2026-1-5',
  '2026-10-05T00:00:00Z',
  '2026-10-05+01:00',
  ' 2026-10-05',
  '2026-10-05 ',
  'not-a-calendar-date',
  '',
  null,
  undefined,
  20261005,
]) {
  assert.equal(isExactCalendarDate(value), false, 'Invalid stored day is review evidence: ' + String(value));
  passed++;
}
console.log(
  JSON.stringify({
    passed,
    failed: 0,
    skipped: 0,
    scope: 'Literal stored calendar-day rendering eligibility; no school-day policy or timezone conversion.',
  }),
);
