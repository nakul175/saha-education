// Manual final built-Worker attendance checks. Every request remains on localhost.
// Requires privately stored synthetic sessions and a disposable final-migrated fixture.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const origin = process.env.SAHA_WORKER_TEST_URL;
const sessionPath = process.env.SAHA_WORKER_SESSION_FIXTURE;
const manifestPath = process.env.SAHA_WORKER_FIXTURE_MANIFEST;
const outputPath = process.env.SAHA_WORKER_TEST_OUTPUT || '/private/tmp/saha-attendance-worker-results.json';
if (!origin || !sessionPath || !manifestPath)
  throw new Error('Supply a local built Worker, private synthetic sessions and attendance fixture manifest.');
const base = new URL(origin);
if (
  !['localhost', '127.0.0.1'].includes(base.hostname) ||
  !['http:', 'https:'].includes(base.protocol) ||
  base.pathname !== '/' ||
  base.username ||
  base.password ||
  base.search ||
  base.hash
)
  throw new Error('Attendance checks require an exact localhost origin.');
if (statSync(sessionPath).mode & 0o077)
  throw new Error('Synthetic sessions must be private to the current user.');
const sessions = JSON.parse(readFileSync(sessionPath, 'utf8'));
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a']) {
  if (typeof sessions[id] !== 'string') throw new Error('Missing a required synthetic session.');
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (
  manifest.synthetic !== true ||
  !manifest.attendanceReview ||
  manifest.attendanceReview.capActivePupils !== 101
)
  throw new Error('A synthetic final-migrated attendance fixture is required.');
const { legacyClassId, capClassId, longNoteClassId } = manifest.attendanceReview;
for (const id of [legacyClassId, capClassId, longNoteClassId])
  if (typeof id !== 'string' || !id) throw new Error('Missing a synthetic attendance class.');

let passed = 0,
  requests = 0,
  externalRequests = 0;
const checks = [];
function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  passed++;
  checks.push(label);
  console.log('ok - ' + label);
}
async function request(path, user, method = 'GET', input, options = {}) {
  const url = new URL(path, base);
  if (url.origin !== base.origin || url.username || url.password) {
    externalRequests++;
    throw new Error('Synthetic attendance requests must remain on the local origin.');
  }
  requests++;
  const response = await fetch(url, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
    headers: {
      ...(user ? { Cookie: sessions[user] } : {}),
      ...(method === 'GET'
        ? {}
        : { Origin: options.origin ?? base.origin, 'Content-Type': 'application/json' }),
    },
    ...(input === undefined ? {} : { body: options.raw ? input : JSON.stringify(input) }),
  });
  // Fully drain each response before making another request to the local Worker.
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
async function json(path, user, method = 'GET', input, expectedStatus = 200, options) {
  const response = await request(path, user, method, input, options);
  check(response.status, expectedStatus, 'Expected local ' + method + ' status ' + expectedStatus);
  check(response.headers.get('cache-control'), 'no-store', 'Sensitive attendance response is uncached');
  return response.json();
}
const editorPath = (classId) => '/api/classes/' + encodeURIComponent(classId) + '/attendance-editor';
const summaryPath = (classId) => '/api/classes/' + encodeURIComponent(classId) + '/attendance-summary';
const date = '2026-10-05',
  secondDate = '2026-10-06',
  suffix = crypto.randomUUID().slice(0, 8);
const snapshot = (classId, chosenDate = date, actor = 'teacher-a') =>
  json(editorPath(classId) + '?date=' + chosenDate, actor);
const history = (classId, chosenDate = date, actor = 'teacher-a', studentId) =>
  json(
    editorPath(classId) +
      '/history?date=' +
      chosenDate +
      (studentId ? '&studentId=' + encodeURIComponent(studentId) : ''),
    actor,
  );
const marks = (classId) =>
  json('/api/attendance?classId=' + encodeURIComponent(classId) + '&date=' + date, 'teacher-a');
function entry(saved, studentId, status, note) {
  const pupil = saved.roster.items.find((row) => row.student.id === studentId);
  assert.ok(pupil, 'Synthetic pupil is present in the exact saved roster');
  return {
    studentId,
    status,
    note: note === undefined ? (pupil.record?.note ?? null) : note,
    expectedRecord: pupil.record,
  };
}
function review(entries, overrides = {}) {
  return {
    date,
    clientRequestId: crypto.randomUUID(),
    reviewConfirmed: true,
    reason: 'Synthetic served attendance review ' + suffix,
    entries,
    ...overrides,
  };
}
function report(failed) {
  const result = {
    executedAt: new Date().toISOString(),
    passed,
    failed,
    skipped: 0,
    requests,
    externalRequests,
    checks,
    limits: [
      'Built localhost Worker and final migrated synthetic sessions only.',
      'Suffix-only classes, pupils and records are created; the dedicated long-note fixture is changed only after browser fixture checks finish.',
      'HTTP concurrency checks use real requests; query-time authority and forced storage faults remain covered by separate SQLite/driver integration suites.',
      'No provider activation, hosted deployment, educational attendance policy or UAT acceptance is asserted.',
    ],
  };
  writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ passed, failed, skipped: 0, requests, externalRequests }));
}

try {
  for (const path of [
    summaryPath('class-a'),
    editorPath('class-a') + '?date=' + date,
    editorPath('class-a') + '/history?date=' + date,
  ]) {
    await json(path, undefined, 'GET', undefined, 401);
  }
  await json(editorPath('class-a'), undefined, 'POST', '{', 401, { raw: true });
  for (const actor of ['guardian-a', 'student-user-a']) {
    await json(editorPath('class-a') + '?date=not-a-date', actor, 'GET', undefined, 403);
    await json(editorPath('class-a') + '/history?date=not-a-date', actor, 'GET', undefined, 403);
    await json(editorPath('class-a'), actor, 'POST', '{', 403, { raw: true });
  }
  await json(editorPath('class-a'), 'teacher-a', 'POST', '{', 403, {
    raw: true,
    origin: 'https://foreign.example.invalid',
  });
  for (const actor of ['admin-b', 'teacher-other']) {
    await json(summaryPath('class-a'), actor, 'GET', undefined, 404);
    await json(editorPath('class-a') + '?date=' + date, actor, 'GET', undefined, 404);
    await json(editorPath('class-a') + '/history?date=' + date, actor, 'GET', undefined, 404);
    await json(
      editorPath('class-a'),
      actor,
      'POST',
      review([{ studentId: 'student-a', status: 'present', note: null, expectedRecord: null }]),
      404,
    );
  }
  for (const [actor, role] of [
    ['guardian-a', 'guardian'],
    ['student-user-a', 'student'],
  ]) {
    const familySummary = await json(summaryPath('class-a'), actor);
    check(familySummary.role, role, 'Legitimate family summary retains its authenticated role');
    check(
      familySummary.pupils.items.map((pupil) => pupil.id),
      ['student-a'],
      'Legitimate family summary contains only its currently linked pupil',
    );
    check(
      JSON.stringify(familySummary).includes('recordedBy'),
      false,
      'Family summary exposes counts without recorder metadata',
    );
    check(
      JSON.stringify(familySummary).includes('note'),
      false,
      'Family summary exposes no raw attendance notes',
    );
  }
  for (const badDate of ['2026-02-30', '1900-02-29', '2026-1-01', 'not-a-date', '']) {
    await json(
      editorPath('class-a') + '?date=' + encodeURIComponent(badDate),
      'teacher-a',
      'GET',
      undefined,
      400,
    );
    await json(
      editorPath('class-a') + '/history?date=' + encodeURIComponent(badDate),
      'teacher-a',
      'GET',
      undefined,
      400,
    );
    await json(
      editorPath('class-a'),
      'teacher-a',
      'POST',
      review([{ studentId: 'student-a', status: 'present', note: null, expectedRecord: null }], {
        date: badDate,
      }),
      400,
    );
  }

  const legacy = await snapshot(legacyClassId);
  check(legacy.roster.total, 1, 'Legacy duplicate pair produces one distinct active pupil');
  check(legacy.roster.items.length, 1, 'Legacy duplicate pair is not displayed twice');
  check(legacy.roster.items[0].enrolmentRows, 2, 'Legacy pair ambiguity is visible');
  check(legacy.roster.items[0].needsReview, true, 'Legacy ambiguous pupil is flagged for review');
  check(legacy.canReview, false, 'Legacy ambiguity blocks a reviewed write');
  const legacyBefore = await history(legacyClassId);
  const legacyMarkBefore = await marks(legacyClassId);
  await json(
    editorPath(legacyClassId),
    'teacher-a',
    'POST',
    review([entry(legacy, legacy.roster.items[0].student.id, 'present')]),
    409,
  );
  check(
    await marks(legacyClassId),
    legacyMarkBefore,
    'Rejected ambiguous write preserves confirmed legacy records',
  );
  check(await history(legacyClassId), legacyBefore, 'Rejected ambiguous write creates no review evidence');

  const cap = await snapshot(capClassId);
  check(cap.roster.total, 101, 'Oversized roster reports its exact total');
  check(cap.roster.items.length, 100, 'Oversized preview is bounded to 100 pupils');
  check(cap.roster.limit, 100, 'Preview declares the roster cap');
  check(cap.roster.truncated, true, 'Oversized preview declares omitted pupils');
  check(cap.canReview, false, 'Incomplete 101-pupil roster blocks reviewed writes');
  const capBefore = await history(capClassId),
    capMarksBefore = await marks(capClassId);
  await json(
    editorPath(capClassId),
    'teacher-a',
    'POST',
    review([entry(cap, cap.roster.items[0].student.id, 'present')]),
    409,
  );
  check(await marks(capClassId), capMarksBefore, 'Cap rejection preserves all existing marks');
  check(await history(capClassId), capBefore, 'Cap rejection creates no review evidence');
  const cappedSummary = await json(summaryPath(capClassId), 'teacher-a');
  check(cappedSummary.pupils.total, 101, 'Recorded-data summary reports the exact oversized pupil total');
  check(cappedSummary.pupils.items.length, 100, 'Recorded-data summary enforces its declared cap');
  check(cappedSummary.pupils.truncated, true, 'Recorded-data summary identifies omitted pupils');

  const classroom = await json(
    '/api/classes',
    'admin-a',
    'POST',
    {
      schoolId: 'a',
      courseId: 'course-a',
      teacherId: 'teacher-a',
      name: 'Synthetic served attendance ' + suffix,
      term: 'Synthetic served term',
    },
    201,
  );
  const pupils = [];
  for (const kind of ['first', 'second', 'untouched']) {
    const pupil = await json(
      '/api/students',
      'admin-a',
      'POST',
      {
        schoolId: 'a',
        firstName: 'Synthetic served attendance',
        lastName: kind + ' ' + suffix,
        dateOfBirth: '2012-01-01',
        admissionNumber: 'ATT-SERVED-' + suffix + '-' + kind,
        gradeLevel: '8',
      },
      201,
    );
    await json('/api/enrolments', 'admin-a', 'POST', { classId: classroom.id, studentId: pupil.id }, 201);
    pupils.push(pupil);
  }
  const [first, second, untouched] = pupils;
  const initial = await snapshot(classroom.id);
  check(
    initial.class,
    { id: classroom.id, name: classroom.name },
    'Editor identifies the selected current class',
  );
  check(initial.date, date, 'Editor retains the exact calendar date');
  check(initial.roster.total, 3, 'Editor includes all three current active synthetic pupils');
  check(
    initial.roster.items.every((row) => row.record === null),
    true,
    'Unrecorded attendance stays unrecorded rather than defaulting present',
  );
  check(initial.canReview, true, 'Complete unambiguous active roster allows a review');
  check((await history(classroom.id)).total, 0, 'Fresh class has no invented historical reviews');
  const validLeapSnapshot = await snapshot(classroom.id, '2000-02-29');
  check(
    validLeapSnapshot.date,
    '2000-02-29',
    'A genuine Gregorian leap date is accepted without an invented school-calendar cutoff',
  );

  const originalRequest = review([
    entry(initial, first.id, 'absent', 'Synthetic private attendance explanation ' + suffix),
  ]);
  const original = await json(editorPath(classroom.id), 'teacher-a', 'POST', originalRequest, 201);
  check(original.replayed, false, 'New reviewed mark identifies a fresh outcome');
  check(
    original.review.id,
    originalRequest.clientRequestId,
    'Client UUID identifies the saved immutable review',
  );
  check(original.review.reviewedBy, 'teacher-a', 'Review is attributable to the authenticated actor');
  check(original.review.changes.length, 1, 'Dirty-only review records exactly one selected pupil');
  check(
    original.review.changes[0].beforeRecord,
    null,
    'Initial evidence preserves the original absence of a mark',
  );
  check(original.review.changes[0].afterRecord.status, 'absent', 'Evidence records the actual saved status');
  check(
    original.review.changes[0].afterRecord.note,
    originalRequest.entries[0].note,
    'Evidence preserves the explicit saved note',
  );
  const initialReplay = await json(editorPath(classroom.id), 'teacher-a', 'POST', originalRequest);
  check(initialReplay.replayed, true, 'Exact UUID retry is identified as replay');
  check(initialReplay.review, original.review, 'Exact UUID retry returns the original immutable evidence');
  check(
    (await marks(classroom.id)).map((row) => row.studentId),
    [first.id],
    'Dirty-only save leaves both unrecorded classmates untouched',
  );
  check((await history(classroom.id)).total, 1, 'Exact replay creates no second review');
  await json(
    editorPath(classroom.id),
    'teacher-a',
    'POST',
    { ...originalRequest, reason: 'A different reviewed reason changes the payload.' },
    409,
  );
  await json(editorPath(classroom.id), 'admin-a', 'POST', originalRequest, 409);
  check((await history(classroom.id)).total, 1, 'UUID payload or actor conflicts do not append evidence');

  const summary = await json(summaryPath(classroom.id), 'teacher-a');
  check(
    summary.class,
    { id: classroom.id, name: classroom.name },
    'Summary identifies the exact selected class',
  );
  check(summary.pupils.total, 3, 'Summary retains current pupils without invented marks');
  const firstSummary = summary.pupils.items.find((row) => row.id === first.id),
    blankSummary = summary.pupils.items.find((row) => row.id === untouched.id);
  check(firstSummary.attendance.recordedRows, 1, 'Summary counts the one actually recorded mark');
  check(
    firstSummary.attendance.counts,
    { present: 0, absent: 1, late: 0, excused: 0, other: 0 },
    'Summary exposes raw saved statuses without a percentage',
  );
  check(firstSummary.attendance.firstDate, date, 'Summary presents the exact valid saved date');
  check(blankSummary.attendance.recordedRows, 0, 'Unrecorded pupil has zero saved rows');
  check(blankSummary.attendance.firstDate, null, 'Unrecorded pupil has no inferred first date');
  check(
    JSON.stringify(summary).includes(originalRequest.entries[0].note),
    false,
    'Summary does not expose private attendance notes',
  );
  check(
    JSON.stringify(summary).includes('identityIssuer'),
    false,
    'Summary does not expose login-provider identity fields',
  );

  const saved = await snapshot(classroom.id),
    beforeCASMarks = await marks(classroom.id),
    beforeCASHistory = await history(classroom.id);
  const currentRecord = saved.roster.items.find((row) => row.student.id === first.id).record;
  const staleFields = {
    id: crypto.randomUUID(),
    status: 'present',
    note: 'Different expected explanation',
    recordedBy: 'admin-a',
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
  };
  for (const [field, value] of Object.entries(staleFields)) {
    const changes = [entry(saved, first.id, 'late'), entry(saved, second.id, 'present')];
    changes[0].expectedRecord = { ...currentRecord, [field]: value };
    await json(editorPath(classroom.id), 'teacher-a', 'POST', review(changes), 409);
    check(
      await marks(classroom.id),
      beforeCASMarks,
      'Full before-record CAS rejects stale ' + field + ' without a partial second-pupil save',
    );
    check(
      await history(classroom.id),
      beforeCASHistory,
      'Stale ' + field + ' creates no review receipt or evidence',
    );
  }
  await json(
    editorPath(classroom.id),
    'teacher-a',
    'POST',
    review([entry(saved, first.id, currentRecord.status, currentRecord.note)]),
    400,
  );
  const duplicate = entry(saved, second.id, 'present');
  await json(editorPath(classroom.id), 'teacher-a', 'POST', review([duplicate, duplicate]), 400);
  await json(
    editorPath(classroom.id),
    'teacher-a',
    'POST',
    review([duplicate], { reason: '😀'.repeat(5) }),
    400,
  );
  await json(
    editorPath(classroom.id),
    'teacher-a',
    'POST',
    review([duplicate], { reason: '😀'.repeat(501) }),
    400,
  );
  await json(
    editorPath(classroom.id),
    'teacher-a',
    'POST',
    review([duplicate], { reviewConfirmed: false }),
    400,
  );
  await json(
    editorPath(classroom.id),
    'teacher-a',
    'POST',
    review([duplicate], { recordedBy: 'admin-a' }),
    400,
  );
  await json(
    editorPath(classroom.id),
    'teacher-a',
    'POST',
    review([{ ...duplicate, note: '😀'.repeat(2001) }]),
    400,
  );
  await json(
    editorPath(classroom.id),
    'teacher-a',
    'POST',
    review([duplicate], { reason: 'x'.repeat(128 * 1024) }),
    400,
  );
  check(
    await marks(classroom.id),
    beforeCASMarks,
    'Invalid/no-op/duplicate/Unicode/oversized reviews preserve all marks',
  );
  check(await history(classroom.id), beforeCASHistory, 'Rejected validation creates no immutable history');

  const simultaneous = review([entry(saved, second.id, 'present', null)]);
  const responses = await Promise.all([
    request(editorPath(classroom.id), 'teacher-a', 'POST', simultaneous),
    request(editorPath(classroom.id), 'teacher-a', 'POST', simultaneous),
  ]);
  check(
    responses.map((response) => response.status).sort(),
    [200, 201],
    'Concurrent same-UUID requests converge to one new review and one exact replay',
  );
  const outcomes = [];
  for (const response of responses) {
    check(response.headers.get('cache-control'), 'no-store', 'Concurrent sensitive outcome is uncached');
    outcomes.push(await response.json());
  }
  check(
    outcomes[0].review,
    outcomes[1].review,
    'Concurrent same-UUID responses contain the same immutable saved evidence',
  );
  check(
    outcomes.map((outcome) => outcome.replayed).sort(),
    [false, true],
    'Concurrent responses truthfully identify fresh versus replayed outcomes',
  );
  check(
    (await history(classroom.id)).items.filter((item) => item.id === simultaneous.clientRequestId).length,
    1,
    'Concurrent retry creates exactly one receipt',
  );
  check(
    (await marks(classroom.id)).filter((item) => item.studentId === second.id).length,
    1,
    'Concurrent retry creates exactly one attendance pair',
  );

  const unicodeSnapshot = await snapshot(classroom.id);
  const unicodeRequest = review([entry(unicodeSnapshot, second.id, 'late', '')], { reason: '😀'.repeat(10) });
  const unicode = await json(editorPath(classroom.id), 'teacher-a', 'POST', unicodeRequest, 201);
  check(
    unicode.review.reason,
    unicodeRequest.reason,
    'Valid Unicode reason uses code-point bounds consistently with storage',
  );
  check(
    unicode.review.changes[0].beforeRecord.note,
    null,
    'Original null note is preserved in before evidence',
  );
  check(unicode.review.changes[0].afterRecord.note, '', 'Explicit empty note remains distinct from null');
  const exactHistory = await history(classroom.id),
    secondPupilHistory = await history(classroom.id, date, 'teacher-a', second.id);
  check(secondPupilHistory.total, 2, 'Student history filter returns only reviews involving that pupil');
  check(
    secondPupilHistory.items.every((item) => item.changes.some((change) => change.studentId === second.id)),
    true,
    'Filtered review batches contain the selected pupil',
  );
  check(JSON.stringify(exactHistory).includes('requestHash'), false, 'History omits private retry digests');
  check(
    JSON.stringify(exactHistory).includes('entriesJson'),
    false,
    'History omits internal pending payloads',
  );
  check(
    (await history(classroom.id, secondDate)).total,
    0,
    'Exact-date history does not combine a different calendar date',
  );

  // The browser worker finishes the dedicated long-note fixture before this suite starts.
  const longSnapshot = await snapshot(longNoteClassId);
  check(longSnapshot.roster.total, 1, 'Dedicated long-note fixture has its exact one-pupil roster');
  const longRow = longSnapshot.roster.items[0],
    longRecord = longRow.record;
  check(typeof longRecord?.note, 'string', 'Dedicated legacy note is actually saved');
  check([...longRecord.note].length > 2000, true, 'Dedicated fixture retains its oversized legacy note');
  const longStatus = longRecord.status === 'excused' ? 'late' : 'excused';
  const longRequest = review([entry(longSnapshot, longRow.student.id, longStatus)]);
  const longResult = await json(editorPath(longNoteClassId), 'teacher-a', 'POST', longRequest, 201);
  check(
    longResult.review.changes[0].beforeRecord,
    longRecord,
    'Long-note review retains every exact original field',
  );
  check(
    longResult.review.changes[0].afterRecord.note,
    longRecord.note,
    'Status-only review preserves the unchanged oversized legacy note',
  );
  check(
    longResult.review.changes[0].afterRecord.status,
    longStatus,
    'Status-only review changes only the intended status and recorder metadata',
  );
  check(
    longResult.review.changes[0].afterRecord.id,
    longRecord.id,
    'Reviewed replacement retains the attendance record identity',
  );
  check(
    longResult.review.changes[0].afterRecord.createdAt,
    longRecord.createdAt,
    'Reviewed replacement retains the original creation time',
  );
  const longHistoryBefore = await history(longNoteClassId);
  await json('/api/attendance', 'teacher-a', 'POST', {
    classId: longNoteClassId,
    date,
    entries: [
      { studentId: longRow.student.id, status: 'present', note: 'Synthetic later legacy mark ' + suffix },
    ],
  });
  const laterLongRecord = (await snapshot(longNoteClassId)).roster.items[0].record;
  check(laterLongRecord.status, 'present', 'Later legacy writer changes the current saved status');
  check(
    laterLongRecord.note,
    'Synthetic later legacy mark ' + suffix,
    'Later legacy writer changes the current saved note',
  );
  check(
    await history(longNoteClassId),
    longHistoryBefore,
    'Later legacy replacement neither rewrites evidence nor invents a reviewed event',
  );
  const longReplay = await json(editorPath(longNoteClassId), 'teacher-a', 'POST', longRequest);
  check(longReplay.replayed, true, 'Exact long-note UUID retry is a committed replay');
  check(longReplay.review, longResult.review, 'Old retry returns the original immutable long-note evidence');
  check(
    (await snapshot(longNoteClassId)).roster.items[0].record,
    laterLongRecord,
    'Old retry never reapplies the earlier status or oversized note',
  );
  check(
    await history(longNoteClassId),
    longHistoryBefore,
    'Old retry appends no extra review after a later legacy change',
  );

  check(externalRequests, 0, 'Every actual request stayed on the synthetic local Worker');
  report(0);
} catch (error) {
  report(1);
  throw error;
}
