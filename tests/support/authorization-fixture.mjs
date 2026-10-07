// Rich synthetic two-school fixture for adversarial authorization/atomicity suites. Everything is created through the
// real route handlers or the real services, so persisted state is what production code would have written. No network.
import { createHash } from 'node:crypto';
import { bindings, freshDatabase, seedSecurityData, load, stamp } from './security-db.mjs';
import { dispatch, origin } from './route-dispatch.mjs';

bindings.SAHA_ALLOWED_ORIGINS = origin;

/** Session-bearing accounts. `peer` rows give a same-class learner/family that unrelated actors must never see. */
export const ACTORS = {
  'admin-a': { role: 'admin', school: 'a' }, 'admin-b': { role: 'admin', school: 'b' },
  'teacher-a': { role: 'teacher', school: 'a' }, 'teacher-other': { role: 'teacher', school: 'a' }, 'teacher-b': { role: 'teacher', school: 'b' },
  'guardian-a': { role: 'guardian', school: 'a' }, 'guardian-other': { role: 'guardian', school: 'a' }, 'guardian-b': { role: 'guardian', school: 'b' },
  'student-user-a': { role: 'student', school: 'a' }, 'student-user-other': { role: 'student', school: 'a' }, 'student-user-b': { role: 'student', school: 'b' },
  'guardian-peer': { role: 'guardian', school: 'a' }, 'student-user-peer': { role: 'student', school: 'a' },
};

const hash = value => createHash('sha256').update(value).digest('hex');

export async function buildFixture() {
  const fixture = freshDatabase();
  const { db, schema, sqlite } = fixture;
  await seedSecurityData(db, schema);
  // A third pupil in the SAME class as student-a: family/student actors must never see this peer.
  await db.insert(schema.users).values([
    { id: 'guardian-peer', name: 'guardian-peer', email: 'guardian-peer@example.invalid', role: 'guardian', schoolId: 'a', identityIssuer: 'https://identity.example.invalid', identitySubject: 'sub-guardian-peer', createdAt: stamp, updatedAt: stamp },
    { id: 'student-user-peer', name: 'student-user-peer', email: 'student-user-peer@example.invalid', role: 'student', schoolId: 'a', identityIssuer: 'https://identity.example.invalid', identitySubject: 'sub-student-user-peer', createdAt: stamp, updatedAt: stamp },
  ]);
  await db.insert(schema.students).values({ id: 'student-peer', schoolId: 'a', userId: 'student-user-peer', firstName: 'student-peer', lastName: 'Synthetic', dateOfBirth: '2012-01-01', admissionNumber: 'student-peer', gradeLevel: '8', createdAt: stamp, updatedAt: stamp });
  await db.insert(schema.guardians).values({ id: 'guardian-profile-peer', schoolId: 'a', userId: 'guardian-peer', name: 'guardian-profile-peer', relationship: 'parent', createdAt: stamp, updatedAt: stamp });
  await db.insert(schema.studentGuardians).values({ studentId: 'student-peer', guardianId: 'guardian-profile-peer', isPrimary: 1 });
  await db.insert(schema.enrolments).values({ id: 'student-peer-enrolment', studentId: 'student-peer', classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp });
  // Accounts used only for session-state attacks.
  await db.insert(schema.users).values([
    { id: 'teacher-disabled', name: 'teacher-disabled', email: 'teacher-disabled@example.invalid', role: 'teacher', schoolId: 'a', identityIssuer: 'https://identity.example.invalid', identitySubject: 'sub-teacher-disabled', createdAt: stamp, updatedAt: stamp },
    { id: 'teacher-unmapped', name: 'teacher-unmapped', email: 'teacher-unmapped@example.invalid', role: 'teacher', schoolId: 'a', identityIssuer: 'https://identity.example.invalid', identitySubject: 'sub-teacher-unmapped', createdAt: stamp, updatedAt: stamp },
    { id: 'teacher-expired', name: 'teacher-expired', email: 'teacher-expired@example.invalid', role: 'teacher', schoolId: 'a', identityIssuer: 'https://identity.example.invalid', identitySubject: 'sub-teacher-expired', createdAt: stamp, updatedAt: stamp },
  ]);

  const sessions = await load('lib/education/session.ts');
  const cookies = {};
  for (const id of [...Object.keys(ACTORS), 'teacher-disabled', 'teacher-unmapped', 'teacher-expired']) cookies[id] = (await sessions.createSession(id)).split(';')[0];
  sqlite.prepare("UPDATE users SET disabled_at='synthetic-disable' WHERE id='teacher-disabled'").run();
  sqlite.prepare("UPDATE users SET identity_subject='' WHERE id='teacher-unmapped'").run();
  const token = id => cookies[id].split('=')[1];
  sqlite.prepare('UPDATE auth_sessions SET expires_at = ? WHERE user_id = ?').run(Date.now() - 1000, 'teacher-expired');

  /** Issue a real request through the real handlers. `actor` is a key of `cookies` or null. */
  async function call(actor, method, path, { body, rawBody, headers = {}, origin: suppliedOrigin = origin, noOrigin = false, cookie } = {}) {
    const requestHeaders = { ...headers };
    if (!noOrigin && suppliedOrigin !== null) requestHeaders.origin = suppliedOrigin;
    const sent = cookie !== undefined ? cookie : (actor ? cookies[actor] : null);
    if (sent) requestHeaders.cookie = sent;
    const init = { method, headers: requestHeaders };
    if (rawBody !== undefined) { requestHeaders['content-type'] = 'application/json'; init.body = rawBody; }
    else if (body !== undefined) { requestHeaders['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
    const response = await dispatch(new Request(origin + path, init));
    const text = await response.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, headers: response.headers, text, json, response };
  }
  const must = async (actor, method, path, options, expected = [200, 201]) => {
    const result = await call(actor, method, path, options);
    if (!expected.includes(result.status)) throw new Error(`Fixture ${method} ${path} as ${actor}: ${result.status} ${result.text.slice(0, 300)}`);
    return result.json;
  };

  const ids = { classA: 'class-a', classOther: 'class-other', classB: 'class-b', studentA: 'student-a', assessmentA: 'assessment-a', assessmentB: 'assessment-b' };
  const resourceContent = { title: 'Synthetic fixture worksheet', type: 'worksheet', curriculum: 'Synthetic only', gradeLevel: '8', subject: 'Mathematics', language: 'en-IN', objectives: 'Compare synthetic fractions.', body: 'Synthetic learner-facing task.', teacherNotes: 'PRIVATE-NOTES-MARKER', answerKey: 'PRIVATE-ANSWER-MARKER' };
  // Resource R1: teacher-a authored, approved, assigned to class-a. R2: teacher-other authored, private draft.
  const r1 = await must('teacher-a', 'POST', '/api/resources', { body: { content: resourceContent, clientResourceId: crypto.randomUUID() } });
  ids.resource = r1.id; ids.version = r1.latest.id;
  await must('teacher-a', 'POST', `/api/resources/${r1.id}/approve`, { body: { versionId: r1.latest.id } });
  const assignment = await must('teacher-a', 'POST', `/api/resources/${r1.id}/assign`, { body: { versionId: r1.latest.id, classId: 'class-a' } });
  ids.assignment = assignment.id;
  const r2 = await must('teacher-other', 'POST', '/api/resources', { body: { content: { ...resourceContent, title: 'Synthetic other-teacher draft', teacherNotes: 'PRIVATE-NOTES-OTHER', answerKey: 'PRIVATE-ANSWER-OTHER' }, clientResourceId: crypto.randomUUID() } });
  ids.resourceOther = r2.id; ids.versionOther = r2.latest.id;
  // Curriculum: C1 admin-authored approved source; C2 teacher-other private draft.
  const curriculumContent = { title: 'Synthetic fixture reference', curriculum: 'Synthetic curriculum', gradeLevel: '8', subject: 'Mathematics', language: 'en-IN', objectives: 'Compare two fractions.', body: 'Compare 1/2 and 1/4.', rightsStatement: 'Original synthetic content written for this test.', sourceReference: 'SYNTHETIC-1' };
  const c1 = await must('admin-a', 'POST', '/api/curriculum', { body: { content: curriculumContent, clientReferenceId: crypto.randomUUID() } });
  ids.curriculum = c1.id; ids.curriculumVersion = c1.latest.id;
  await must('admin-a', 'POST', `/api/curriculum/${c1.id}/approve`, { body: { versionId: c1.latest.id, confirmReview: true } });
  const c2 = await must('teacher-other', 'POST', '/api/curriculum', { body: { content: { ...curriculumContent, title: 'Synthetic other-teacher draft ref' }, clientReferenceId: crypto.randomUUID() } });
  ids.curriculumOther = c2.id; ids.curriculumOtherVersion = c2.latest.id;
  // Submission, feedback and window on the class-a assignment.
  const submission = await must('student-user-a', 'POST', `/api/assignments/${ids.assignment}/submissions`, { body: { response: 'Synthetic learner answer.', expectedAttempt: 0, clientSubmissionId: crypto.randomUUID() } });
  ids.submission = submission.id;
  const feedback = await must('teacher-a', 'POST', `/api/assignments/${ids.assignment}/submissions/${submission.id}/feedback`, { body: { feedback: 'Reviewed formative guidance.', reviewed: true, expectedRevision: 0, clientFeedbackId: crypto.randomUUID() } });
  ids.feedback = feedback.id;
  await must('teacher-a', 'POST', `/api/assignments/${ids.assignment}/submission-window`, { body: { clientPolicyId: crypto.randomUUID(), expectedRevision: 0, state: 'open', closesAt: null, reviewConfirmed: true, reason: 'Synthetic reviewed open policy.' } });
  // Reading check + correction + staged import.
  const reading = await must('teacher-a', 'POST', '/api/reading-checks', { body: { clientCheckId: crypto.randomUUID(), classId: 'class-a', studentId: 'student-a', language: 'en-IN', passageReference: 'Synthetic passage', readingDate: '2026-10-01', durationSeconds: 45, wordsAttempted: 40, wordsCorrect: 36 } });
  ids.reading = reading.id;
  await must('teacher-a', 'POST', `/api/reading-checks/${reading.id}/corrections`, { body: { clientCorrectionId: crypto.randomUUID(), expectedRevision: 0, confirmReviewed: true, reason: 'Synthetic reviewed correction.', language: 'en-IN', passageReference: 'Synthetic passage', readingDate: '2026-10-01', durationSeconds: 45, wordsAttempted: 40, wordsCorrect: 37 } });
  const staged = await must('teacher-a', 'POST', '/api/reading-imports', { body: { clientImportId: crypto.randomUUID(), envelope: { format: 'saha.reading-results.v1', classId: 'class-a', sourceLabel: 'Synthetic namespace', sourceReference: 'Synthetic batch', rows: [{ externalReference: 'synthetic-ref-1', studentId: 'student-a', language: 'en-IN', passageReference: 'Synthetic passage', readingDate: '2026-10-01', durationSeconds: 45, wordsAttempted: 40, wordsCorrect: 36 }] } } });
  ids.import = staged.draft.id;
  // Reviewed attendance and result review.
  const editor = await must('teacher-a', 'GET', '/api/classes/class-a/attendance-editor?date=2026-10-02');
  await must('teacher-a', 'POST', '/api/classes/class-a/attendance-editor', { body: { date: '2026-10-02', clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Synthetic reviewed attendance change.', entries: [{ studentId: 'student-a', status: 'present', note: null, expectedRecord: null }] } });
  void editor;
  const resultEditor = await must('teacher-a', 'GET', '/api/assessments/assessment-a/result-editor');
  await must('teacher-a', 'POST', '/api/assessments/assessment-a/result-editor', { body: { clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Synthetic explicit assessment result review.', expectedAssessment: resultEditor.assessment, entries: [{ studentId: 'student-a', score: 7, grade: 'B', feedback: 'Synthetic.', expectedRecord: null }] } });
  // Registry receipt, profile-link event and identity provisioning event (admin evidence).
  ids.registryRequest = crypto.randomUUID();
  await must('admin-a', 'POST', '/api/registry/students', { body: { clientRequestId: ids.registryRequest, reviewConfirmed: true, reason: 'Synthetic administrator creation review', profile: { firstName: 'Registry', lastName: 'Fixture', dateOfBirth: '2012-01-01', admissionNumber: 'REGISTRY-FIXTURE', gradeLevel: '8' } } });
  await must('admin-a', 'POST', '/api/admin/users', { body: { clientRequestId: crypto.randomUUID(), name: 'Provisioned teacher', email: 'prov@example.invalid', role: 'teacher', identityIssuer: 'https://identity.example.invalid', identitySubject: 'fixture-provisioned-subject', reviewConfirmed: true, reason: 'Reviewed synthetic identity against approved roster' } });
  // Report publication (publish draft-a to create a receipt and notices), plus one report that stays a private draft.
  await must('admin-a', 'PATCH', '/api/report-cards/draft-a', { body: { publish: true } });
  const draft = await must('admin-a', 'POST', '/api/report-cards', { body: { studentId: 'student-a', term: 'T3 private', overallGrade: 'C', summary: 'PRIVATE-DRAFT-MARKER' } });
  ids.reportDraft = draft.id;
  // Reviewed profile ownership: unlink then relink the peer pupil so profile_link_events/versions hold evidence.
  const unlinked = await must('admin-a', 'POST', '/api/admin/profile-links', { body: { profileType: 'student', profileId: 'student-peer', userId: null, expectedVersion: 0, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Synthetic explicit profile ownership review.' } });
  await must('admin-a', 'POST', '/api/admin/profile-links', { body: { profileType: 'student', profileId: 'student-peer', userId: 'student-user-peer', expectedVersion: unlinked.profile.version, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Synthetic explicit profile ownership review.' } });
  cookies['student-user-peer'] = (await sessions.createSession('student-user-peer')).split(';')[0];
  // Evidence added for the merged v2.13 inventory: a class notice with a correction, a school term, a course-creation receipt
  // from the reviewed lifecycle service and the id of one real audit entry. Everything goes through the real handlers.
  const notice = await must('teacher-a', 'POST', '/api/notices', { body: { clientRequestId: crypto.randomUUID(), title: 'Synthetic class notice', body: 'Synthetic notice body for the class.', audience: { kind: 'class', classId: 'class-a', roles: 'both' }, reviewConfirmed: true } });
  ids.notice = notice.notice.id;
  await must('teacher-a', 'POST', `/api/notices/${ids.notice}/corrections`, { body: { clientRequestId: crypto.randomUUID(), title: 'Synthetic class notice (corrected)', body: 'Synthetic corrected body.', reason: 'Synthetic reviewed correction reason.', reviewConfirmed: true } });
  const term = await must('admin-a', 'POST', '/api/schools/a/terms', { body: { clientRequestId: crypto.randomUUID(), academicYear: '2026-27', name: 'Synthetic term one', startsOn: '2026-04-01', endsOn: '2026-09-30' } });
  ids.term = term.term.id;
  ids.academicChange = crypto.randomUUID();
  await must('admin-a', 'POST', '/api/academic-changes', { body: { clientRequestId: ids.academicChange, changes: [{ kind: 'course.create', code: 'FIXTURE-ACADEMIC', title: 'Synthetic lifecycle course', description: null, gradeLevel: '8' }] } });
  ids.auditSource = 'attendance';
  ids.auditEntry = sqlite.prepare("SELECT id FROM attendance_reviews WHERE school_id='a' LIMIT 1").get().id;

  /** SHA-256 fingerprint of every table's rows: any partial write, however small, changes it. */
  function fingerprint(tables) {
    const names = tables ?? sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name").all().map(row => row.name);
    const result = {};
    for (const name of names) {
      const rows = sqlite.prepare(`SELECT * FROM "${name}"`).all().map(row => JSON.stringify(row)).sort();
      result[name] = hash(rows.join('\n')) + ':' + rows.length;
    }
    return result;
  }
  function changedTables(before, after) { return Object.keys(after).filter(name => before[name] !== after[name]); }
  return { ...fixture, ids, cookies, token, call, must, fingerprint, changedTables, sessions };
}
