// Reviewed role and sign-in identity changes (FR-04, FR-02, NFR-01): actual opaque sessions, production Drizzle SQL over
// isolated SQLite (and the production D1 prepared-batch driver), real route handlers, synthetic identities only.
import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession, principalForToken } = await load('lib/education/session.ts');
const policy = await load('lib/education/demo-policy.ts');
const collection = await load('app/api/admin/users/route.ts');
const detail = await load('app/api/admin/users/[id]/route.ts');
const roleRoute = await load('app/api/admin/users/[id]/role/route.ts');
const identityRoute = await load('app/api/admin/users/[id]/identity/route.ts');
const changesRoute = await load('app/api/admin/users/changes/route.ts');
const eventsRoute = await load('app/api/admin/users/events/route.ts');
const origin = 'https://education.example.invalid';
const provider = 'https://identity.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = {};
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'guardian-a', 'student-user-a']) sessions[id] = (await createSession(id)).split(';')[0];
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function count(table, where = '1=1') { return sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get().n; }
function request(actor, method, value, suppliedOrigin = origin, path = '/api/admin/users') {
  const headers = { origin: suppliedOrigin };
  if (actor) headers.cookie = sessions[actor];
  const init = { method, headers };
  if (value !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(value); }
  return new Request(origin + path, init);
}
const context = id => ({ params: Promise.resolve({ id }) });
const role = (actor, id, value, suppliedOrigin) => roleRoute.PATCH(request(actor, 'PATCH', value, suppliedOrigin, `/api/admin/users/${id}/role`), context(id));
const identity = (actor, id, value, suppliedOrigin) => identityRoute.PATCH(request(actor, 'PATCH', value, suppliedOrigin, `/api/admin/users/${id}/identity`), context(id));
const show = (actor, id) => detail.GET(request(actor, 'GET', undefined, origin, `/api/admin/users/${id}`), context(id));
const uuid = () => crypto.randomUUID();
const why = 'Reviewed synthetic roster decision with the school';
const roleBody = (extra = {}) => ({ clientRequestId: uuid(), expectedVersion: 1, role: 'student', reviewConfirmed: true, reason: why, ...extra });
const linkBody = (extra = {}) => ({ clientRequestId: uuid(), expectedVersion: 0, action: 'link', identityIssuer: provider, identitySubject: 'relinked-subject', reviewConfirmed: true, reason: why, ...extra });
const unlinkBody = (extra = {}) => ({ clientRequestId: uuid(), expectedVersion: 1, action: 'unlink', reviewConfirmed: true, reason: why, ...extra });
async function provision(actor, name, subject, extra = {}) {
  const response = await collection.POST(request(actor, 'POST', { clientRequestId: uuid(), name, email: `${subject}@example.invalid`, role: 'teacher',
    identityIssuer: provider, identitySubject: subject, reviewConfirmed: true, reason: why, ...extra }));
  check(response.status, 201, 'Reviewed provisioning of ' + name);
  return (await response.json()).user;
}
const originalFetch = globalThis.fetch; let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Identity changes must not contact a provider'); };
try {
  // ---- Access: authentication, role, origin and tenant boundaries ---------------------------------------------------
  const probe = { id: 'teacher-a', body: roleBody() };
  check((await role(null, probe.id, probe.body)).status, 401, 'Anonymous role change is denied');
  check((await identity(null, probe.id, unlinkBody())).status, 401, 'Anonymous identity change is denied');
  check((await changesRoute.GET(request(null, 'GET', undefined, origin, '/api/admin/users/changes'))).status, 401, 'Anonymous change history is denied');
  check((await show(null, probe.id)).status, 401, 'Anonymous account detail is denied');
  const spoof = new Request(origin + '/api/admin/users/teacher-a/role', { method: 'PATCH', headers: { origin, cookie: 'saha_demo_role=admin', 'x-saha-role': 'admin', 'x-saha-user-id': 'admin-a', 'content-type': 'application/json' }, body: JSON.stringify(roleBody()) });
  check((await roleRoute.PATCH(spoof, context('teacher-a'))).status, 401, 'Public role cookie and identity headers cannot change roles');
  for (const actor of ['teacher-a', 'guardian-a', 'student-user-a']) {
    check((await role(actor, 'teacher-a', roleBody())).status, 403, 'Only administrators change roles: ' + actor);
    check((await identity(actor, 'teacher-a', unlinkBody())).status, 403, 'Only administrators change sign-in identity: ' + actor);
    check((await show(actor, 'teacher-a')).status, 403, 'Only administrators read account detail: ' + actor);
    check((await changesRoute.GET(request(actor, 'GET', undefined, origin, '/api/admin/users/changes'))).status, 403, 'Only administrators read change history: ' + actor);
    const malformed = request(actor, 'PATCH', roleBody(), origin, '/api/admin/users/teacher-a/role'); malformed.headers.set('content-type', 'text/plain');
    check((await roleRoute.PATCH(malformed, context('teacher-a'))).status, 403, 'Role authorization precedes body parsing: ' + actor);
  }
  check((await role('admin-a', 'teacher-a', roleBody(), 'https://attacker.example.invalid')).status, 403, 'Cross-origin role change is denied');
  check((await identity('admin-a', 'teacher-a', unlinkBody(), 'https://attacker.example.invalid')).status, 403, 'Cross-origin identity change is denied');
  const noOrigin = request('admin-a', 'PATCH', roleBody(), origin, '/api/admin/users/teacher-other/role'); noOrigin.headers.delete('origin');
  check((await roleRoute.PATCH(noOrigin, context('teacher-other'))).status, 403, 'Origin is required for role changes');
  check((await role('admin-b', 'teacher-a', roleBody({ expectedVersion: 0 }))).status, 404, 'Foreign school administrator cannot see the target');
  check((await identity('admin-b', 'teacher-a', unlinkBody({ expectedVersion: 0 }))).status, 404, 'Foreign school administrator cannot unlink the target');
  check((await show('admin-b', 'teacher-a')).status, 404, 'Foreign school administrator cannot read the target detail');
  check((await role('admin-a', 'missing-user', roleBody({ expectedVersion: 0 }))).status, 404, 'Missing target is reported as not found');
  check(count('identity_admin_changes'), 0, 'Denied requests write no evidence');
  check(sqlite.prepare("SELECT role FROM users WHERE id='teacher-a'").get().role, 'teacher', 'Denied requests change no role');

  // ---- Role change: authority, evidence, sessions ----------------------------------------------------------------------
  const subject = await provision('admin-a', 'Reviewed movable teacher', 'movable-subject');
  sessions.movable = (await createSession(subject.id)).split(';')[0];
  const secondMovable = (await createSession(subject.id)).split(';')[0];
  check(count('auth_sessions', `user_id='${subject.id}'`), 2, 'The target has two actual sessions');
  const first = roleBody({ clientRequestId: uuid(), role: 'student' });
  let response = await role('admin-a', subject.id, first);
  check(response.status, 200, 'Administrator reassigns a school role');
  check(response.headers.get('cache-control'), 'no-store', 'Role change responses are uncached');
  const changed = await response.json();
  check(changed.user.role, 'student', 'Account has the reviewed role');
  check(changed.user.version, 2, 'Role change increments the shared account revision');
  check({ action: changed.event.action, previousRole: changed.event.previousRole, nextRole: changed.event.nextRole, actorId: changed.event.actorId,
    userId: changed.event.userId, schoolId: changed.event.schoolId, reason: changed.event.reason, expectedVersion: 1, resultingVersion: changed.event.resultingVersion },
  { action: 'change_role', previousRole: 'teacher', nextRole: 'student', actorId: 'admin-a', userId: subject.id, schoolId: 'a', reason: why, expectedVersion: 1, resultingVersion: 2 }, 'Evidence records prior and new role, actor, school and reason');
  check(changed.event.previousIssuer, provider, 'Evidence retains the unchanged issuer');
  check(Object.hasOwn(changed.event, 'requestHash') || Object.hasOwn(changed.event, 'attemptId'), false, 'Private request fingerprint and attempt marker stay hidden');
  check(Number.isFinite(Date.parse(changed.event.reviewedAt)), true, 'Review time is server generated');
  check(count('auth_sessions', `user_id='${subject.id}'`), 0, 'Role change revokes every target session in the same batch');
  check(await principalForToken(sessions.movable.split('=')[1]), null, 'First old session cannot authenticate');
  check(await principalForToken(secondMovable.split('=')[1]), null, 'Second old session cannot authenticate');
  check(sqlite.prepare('SELECT version FROM identity_admin_user_versions WHERE user_id=?').get(subject.id).version, 2, 'Revision row follows the decision');
  response = await role('admin-a', subject.id, first);
  check(response.status, 200, 'Exact role replay succeeds');
  check(await response.json(), changed, 'Replay returns the original evidence and current account');
  check(count('identity_admin_changes'), 1, 'Replay appends no second evidence');
  response = await role('admin-a', subject.id, { ...first, role: 'guardian' });
  check([response.status, (await response.json()).reason], [409, 'request_reused'], 'A changed payload cannot reuse a decision UUID');
  response = await role('admin-a', subject.id, roleBody({ expectedVersion: 1, role: 'guardian' }));
  check([response.status, (await response.json()).reason], [409, 'stale_version'], 'A stale revision conflicts with a plain reason');
  response = await role('admin-a', subject.id, roleBody({ expectedVersion: 2, role: 'student' }));
  check([response.status, (await response.json()).reason], [409, 'no_change'], 'Assigning the current role is refused as a no-op');
  const second = roleBody({ expectedVersion: 2, role: 'guardian' });
  check((await role('admin-a', subject.id, second)).status, 200, 'A further reviewed change applies at the current revision');
  response = await role('admin-a', subject.id, first);
  check(response.status, 200, 'The earlier decision can be safely replayed afterwards');
  check((await response.json()).user.role, 'guardian', 'Replay never reapplies an old decision');
  check(sqlite.prepare('SELECT version FROM identity_admin_user_versions WHERE user_id=?').get(subject.id).version, 3, 'Replay cannot rewind the revision');
  check(count('identity_admin_changes'), 2, 'Only two reviewed decisions exist');
  response = await role('admin-a', subject.id, roleBody({ expectedVersion: 3, role: 'admin' }));
  check(response.status, 200, 'An administrator may appoint another administrator in their own school');
  check(sqlite.prepare('SELECT role FROM users WHERE id=?').get(subject.id).role, 'admin', 'The appointed account holds the administrator role');
  sessions.appointed = (await createSession(subject.id)).split(';')[0];
  check((await collection.GET(request('appointed', 'GET'))).status, 200, 'The appointed administrator is immediately an authorised administrator');
  check((await role('appointed', 'admin-a', roleBody({ expectedVersion: 0, role: 'teacher' }))).status, 200, 'A second administrator may reduce the first (an enabled administrator remains)');
  check(sqlite.prepare("SELECT role FROM users WHERE id='admin-a'").get().role, 'teacher', 'The first administrator now holds the teacher role');
  check((await collection.GET(request('admin-a'))).status, 401, 'The reduced administrator is signed out immediately because the role change revoked their sessions');
  sqlite.prepare("UPDATE users SET role='admin' WHERE id='admin-a'").run();
  sqlite.prepare("DELETE FROM auth_sessions WHERE user_id='admin-a'").run();
  sessions['admin-a'] = (await createSession('admin-a')).split(';')[0];
  sqlite.prepare("UPDATE users SET role='teacher' WHERE id=?").run(subject.id);

  // ---- Refusals: self, dependencies, bounds -----------------------------------------------------------------------
  const events = () => count('identity_admin_changes');
  const beforeRefusals = events();
  response = await role('admin-a', 'admin-a', roleBody({ expectedVersion: 0, role: 'teacher' }));
  check([response.status, (await response.json()).reason], [409, 'self'], 'An administrator cannot change their own role');
  response = await identity('admin-a', 'admin-a', unlinkBody({ expectedVersion: 0 }));
  check([response.status, (await response.json()).reason], [409, 'self'], 'An administrator cannot unlink their own sign-in identity');
  response = await role('admin-a', 'teacher-a', roleBody({ expectedVersion: 0, role: 'guardian' }));
  check([response.status, (await response.json()).reason], [409, 'class_assigned'], 'A teacher who owns classes keeps the teacher role');
  response = await role('admin-a', 'guardian-a', roleBody({ expectedVersion: 0, role: 'teacher' }));
  check([response.status, (await response.json()).reason], [409, 'profile_linked'], 'A linked guardian account keeps the guardian role');
  response = await role('admin-a', 'student-user-a', roleBody({ expectedVersion: 0, role: 'admin' }));
  check([response.status, (await response.json()).reason], [409, 'profile_linked'], 'A linked student account cannot be promoted to administrator');
  check(events(), beforeRefusals, 'Refused decisions append no evidence');
  check(sqlite.prepare("SELECT role FROM users WHERE id IN ('teacher-a','guardian-a','student-user-a') ORDER BY id").all().map(row => row.role), ['guardian', 'student', 'teacher'], 'Refused decisions change no account');
  check(await principalForToken(sessions['teacher-a'].split('=')[1]) !== null, true, 'Refused decisions keep the target sessions');
  const invalidRole = [{ role: 'owner' }, { role: 'teacher,admin' }, { role: undefined }, { schoolId: 'b' }, { actorId: 'admin-b' }, { userId: 'teacher-b' }, { identityIssuer: provider },
    { reviewConfirmed: false }, { reviewConfirmed: undefined }, { reason: 'short' }, { reason: 'x'.repeat(501) }, { reason: 'private\nreason text' },
    { clientRequestId: 'invalid' }, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: '1' }, { expectedVersion: 1000001 }];
  for (const altered of invalidRole) check((await role('admin-a', subject.id, roleBody({ expectedVersion: 4, role: 'student', ...altered }))).status, 400, 'Invalid or spoofed role fields fail closed: ' + JSON.stringify(altered).slice(0, 40));
  const invalidIdentity = [{ action: 'rename' }, { action: undefined }, { identityIssuer: 'http://identity.example.invalid' }, { identityIssuer: 'https://u:p@identity.example.invalid' },
    { identityIssuer: provider + '?tenant=x' }, { identityIssuer: provider + '#frag' }, { identityIssuer: ' ' + provider }, { identitySubject: '' }, { identitySubject: ' spaced ' },
    { identitySubject: 'a\nb' }, { identitySubject: 'x'.repeat(256) }, { role: 'admin' }, { schoolId: 'b' }, { email: 'x@example.invalid' }, { reviewConfirmed: false }];
  for (const altered of invalidIdentity) check((await identity('admin-a', 'legacy-unmapped', linkBody({ ...altered }))).status, 400, 'Invalid or spoofed identity fields fail closed: ' + JSON.stringify(altered).slice(0, 40));
  check((await identity('admin-a', 'legacy-unmapped', unlinkBody({ identityIssuer: provider }))).status, 400, 'Unlink accepts no identity fields');
  const oversized = new Request(origin + '/api/admin/users/teacher-other/role', { method: 'PATCH', headers: { origin, cookie: sessions['admin-a'], 'content-type': 'application/json' }, body: JSON.stringify(roleBody({ reason: 'x'.repeat(140000) })) });
  check((await roleRoute.PATCH(oversized, context('teacher-other'))).status, 400, 'Oversized role bodies are refused');
  check(events(), beforeRefusals, 'Invalid requests append no evidence');

  // ---- Link and unlink of the school sign-in identity ---------------------------------------------------------------------
  sqlite.prepare("INSERT INTO users(id,name,email,role,school_id,identity_issuer,identity_subject,created_at,updated_at) VALUES ('legacy-unmapped','Legacy teacher','legacy-unmapped@example.invalid','teacher','a',NULL,NULL,'2026-10-05T00:00:00.000Z','2026-10-05T00:00:00.000Z')").run();
  sqlite.prepare("INSERT INTO users(id,name,email,role,school_id,identity_issuer,identity_subject,created_at,updated_at) VALUES ('legacy-half','Half-mapped teacher','legacy-half@example.invalid','teacher','a',?,NULL,'2026-10-05T00:00:00.000Z','2026-10-05T00:00:00.000Z')").run(provider);
  sqlite.prepare("INSERT INTO users(id,name,email,role,school_id,identity_issuer,identity_subject,created_at,updated_at) VALUES ('legacy-b','Foreign legacy','legacy-b@example.invalid','teacher','b',NULL,NULL,'2026-10-05T00:00:00.000Z','2026-10-05T00:00:00.000Z')").run();
  let view = await (await show('admin-a', 'legacy-unmapped')).json();
  check([view.user.identityIssuer, view.user.version, view.fixedDemoAccount, view.demoRuntime, view.profile], [null, 0, false, false, null], 'Detail shows an unmapped legacy account at revision 0');
  check((await principalForToken(null)), null, 'Unmapped accounts have no session path');
  const link = linkBody({ identitySubject: 'legacy-new-subject' });
  response = await identity('admin-a', 'legacy-unmapped', link);
  check(response.status, 200, 'Administrator links an exact provider identity to a legacy account');
  const linked = await response.json();
  check({ action: linked.event.action, previousIssuer: linked.event.previousIssuer, previousSubject: linked.event.previousSubject, nextIssuer: linked.event.nextIssuer, nextSubject: linked.event.nextSubject, role: linked.event.nextRole, version: linked.user.version },
    { action: 'link_identity', previousIssuer: null, previousSubject: null, nextIssuer: provider, nextSubject: 'legacy-new-subject', role: 'teacher', version: 1 }, 'Evidence records no prior and the exact new identity');
  check([linked.user.identityIssuer, linked.user.identitySubject, linked.user.email], [provider, 'legacy-new-subject', 'legacy-unmapped@example.invalid'], 'Only the identity changes; email is never used to link');
  sessions.legacy = (await createSession('legacy-unmapped')).split(';')[0];
  check((await principalForToken(sessions.legacy.split('=')[1]))?.id, 'legacy-unmapped', 'The linked account can establish a session');
  response = await identity('admin-a', 'legacy-unmapped', link);
  check([response.status, (await response.json()).event.id], [200, link.clientRequestId], 'Exact link replay returns the original decision');
  check(count('identity_admin_changes', "action='link_identity'"), 1, 'Replay appends no duplicate link evidence');
  response = await identity('admin-a', 'legacy-unmapped', linkBody({ expectedVersion: 1, identitySubject: 'other-subject' }));
  check([response.status, (await response.json()).reason], [409, 'already_mapped'], 'An already mapped account cannot be silently remapped; unlink first');
  response = await identity('admin-a', 'legacy-half', linkBody({ identitySubject: 'legacy-new-subject' }));
  check([response.status, (await response.json()).reason], [409, 'identity_in_use'], 'A provider identity already assigned to another account is a conflict');
  response = await identity('admin-a', 'legacy-half', linkBody({ identitySubject: 'sub-teacher-a' }));
  check([response.status, (await response.json()).reason], [409, 'identity_in_use'], 'An identity held by an existing school account is a conflict');
  response = await identity('admin-a', 'legacy-b', linkBody({ identitySubject: 'foreign-subject' }));
  check(response.status, 404, 'A foreign school account cannot be linked by this administrator');
  response = await identity('admin-a', 'legacy-half', linkBody({ identitySubject: 'half-complete-subject' }));
  check([response.status, (await response.json()).user.identityIssuer], [200, provider], 'A half-mapped legacy account can be completed');
  check(count('auth_sessions', "user_id='legacy-half'"), 0, 'Linking leaves no automatic session');

  const removable = await provision('admin-a', 'Reviewed removable teacher', 'removable-subject');
  sessions.removable = (await createSession(removable.id)).split(';')[0];
  const unlink = unlinkBody();
  response = await identity('admin-a', removable.id, unlink);
  check(response.status, 200, 'Administrator unlinks a sign-in identity');
  const unlinked = await response.json();
  check({ action: unlinked.event.action, previousIssuer: unlinked.event.previousIssuer, previousSubject: unlinked.event.previousSubject, nextIssuer: unlinked.event.nextIssuer, nextSubject: unlinked.event.nextSubject, version: unlinked.user.version },
    { action: 'unlink_identity', previousIssuer: provider, previousSubject: 'removable-subject', nextIssuer: null, nextSubject: null, version: 2 }, 'Evidence retains the removed identity');
  check([unlinked.user.identityIssuer, unlinked.user.identitySubject, unlinked.user.disabledAt], [null, null, null], 'The account keeps its record but no identity');
  check(await principalForToken(sessions.removable.split('=')[1]), null, 'Unlinking revokes the account sessions');
  check((await collection.GET(request('removable'))).status, 401, 'The unlinked account is signed out');
  response = await identity('admin-a', removable.id, unlinkBody({ expectedVersion: 2 }));
  check([response.status, (await response.json()).reason], [409, 'not_mapped'], 'An unmapped account cannot be unlinked again');
  response = await identity('admin-a', removable.id, linkBody({ expectedVersion: 2, identitySubject: 'removable-subject' }));
  check(response.status, 200, 'A reviewed relink to the freed identity is possible');
  response = await identity('admin-a', removable.id, unlink);
  check([response.status, (await response.json()).user.identitySubject], [200, 'removable-subject'], 'The earlier unlink replay returns the original event with the current account');
  check(count('identity_admin_changes', `user_id='${removable.id}'`), 2, 'Only the unlink and the relink are recorded as identity decisions (provisioning keeps its own evidence)');
  check(sqlite.prepare('SELECT version FROM identity_admin_user_versions WHERE user_id=?').get(removable.id).version, 3, 'Revision follows each decision');

  // The reduced-authority profile owner: unlinking keeps the profile record and fails closed.
  response = await identity('admin-a', 'student-user-a', unlinkBody({ expectedVersion: 0 }));
  check(response.status, 200, 'A profile owner may be unlinked');
  check(sqlite.prepare("SELECT user_id FROM students WHERE id='student-a'").get().user_id, 'student-user-a', 'The learner profile and its ownership record are preserved');
  check(await principalForToken(sessions['student-user-a'].split('=')[1]), null, 'The unlinked profile owner cannot reach the profile');

  // ---- History, detail and scope -----------------------------------------------------------------------------------------
  const history = await (await changesRoute.GET(request('admin-a', 'GET', undefined, origin, '/api/admin/users/changes'))).json();
  check(history.every(row => row.schoolId === 'a'), true, 'Change history is school scoped');
  check(history.length, count('identity_admin_changes'), 'History lists the decisions');
  check(history.some(row => row.action === 'unlink_identity') && history.some(row => row.action === 'link_identity') && history.some(row => row.action === 'change_role'), true, 'History includes every decision kind');
  check(history.every(row => !Object.hasOwn(row, 'requestHash') && !Object.hasOwn(row, 'attemptId')), true, 'History never serialises private markers');
  check(await (await changesRoute.GET(request('admin-b', 'GET', undefined, origin, '/api/admin/users/changes'))).json(), [], 'A foreign school sees none of these decisions');
  const detailRows = await (await show('admin-a', 'teacher-a')).json();
  check([detailRows.classCount, detailRows.user.role, detailRows.lastEnabledAdministrator, detailRows.profile], [1, 'teacher', false, null], 'Detail exposes dependency facts for review');
  const guardianDetail = await (await show('admin-a', 'guardian-a')).json();
  check(guardianDetail.profile, { kind: 'guardian', name: 'guardian-profile-a' }, 'Detail names the linked guardian profile');
  const lone = await (await show('admin-b', 'admin-b')).json();
  check([lone.lastEnabledAdministrator, lone.user.id], [true, 'admin-b'], 'Detail identifies the only enabled administrator');
  const status = await (await eventsRoute.GET(request('admin-a', 'GET', undefined, origin, '/api/admin/users/events'))).json();
  check(status.every(row => ['provision', 'enable', 'disable'].includes(row.action)), true, 'Existing status evidence contract is unchanged');
  for (const statement of ["UPDATE identity_admin_changes SET reason='rewritten history text'", 'DELETE FROM identity_admin_changes']) {
    assert.throws(() => sqlite.exec(statement), /immutable/); checks++;
  }

  // ---- Shared revision: status changes and decisions serialise ------------------------------------------------------------
  const stateful = await provision('admin-a', 'Reviewed stateful teacher', 'stateful-subject');
  response = await role('admin-a', stateful.id, roleBody({ role: 'student' }));
  check(response.status, 200, 'Role change at revision one');
  const statusRoute = await load('app/api/admin/users/[id]/route.ts');
  const disableAt = expected => statusRoute.PATCH(request('admin-a', 'PATCH', { clientRequestId: uuid(), expectedVersion: expected, enabled: false, reviewConfirmed: true, reason: why }, origin, `/api/admin/users/${stateful.id}`), context(stateful.id));
  check((await disableAt(1)).status, 409, 'A status change at the old revision conflicts after a role change');
  check((await disableAt(2)).status, 200, 'The status change at the current revision succeeds');
  response = await role('admin-a', stateful.id, roleBody({ expectedVersion: 3, role: 'guardian' }));
  check(response.status, 200, 'A disabled account can still be reassigned before restoration');
  check(sqlite.prepare('SELECT disabled_at IS NOT NULL AS d FROM users WHERE id=?').get(stateful.id).d, 1, 'Reassignment does not enable the account');

  // ---- Races and failure atomicity ---------------------------------------------------------------------------------------
  const racer = await provision('admin-a', 'Reviewed racing teacher', 'racer-subject');
  const winners = await Promise.all([role('admin-a', racer.id, roleBody({ role: 'student' })), role('admin-a', racer.id, roleBody({ role: 'guardian' }))]);
  check(winners.map(result => result.status).sort(), [200, 409], 'Competing decisions at one revision have exactly one winner');
  check(sqlite.prepare('SELECT version FROM identity_admin_user_versions WHERE user_id=?').get(racer.id).version, 2, 'The race increments the revision once');
  const sameId = roleBody({ expectedVersion: 2, role: 'teacher' });
  const same = await Promise.all([role('admin-a', racer.id, sameId), role('admin-a', racer.id, sameId)]);
  check(same.map(result => result.status), [200, 200], 'Concurrent identical retries both succeed');
  check(count('identity_admin_changes', `user_id='${racer.id}'`), 2, 'Concurrent identical retries create one decision');
  const originalBatch = db.batch.bind(db);
  const guardUser = await provision('admin-a', 'Reviewed atomic teacher', 'atomic-subject');
  sessions.atomic = (await createSession(guardUser.id)).split(';')[0];
  sqlite.exec(`CREATE TRIGGER identity_change_test_failure BEFORE UPDATE OF role ON users WHEN NEW.id='${guardUser.id}' BEGIN SELECT RAISE(ABORT, 'synthetic transaction failure'); END;`);
  const beforeFailure = events();
  check((await role('admin-a', guardUser.id, roleBody({ role: 'student' }))).status, 500, 'A database failure is safely reported');
  check([events(), sqlite.prepare('SELECT role FROM users WHERE id=?').get(guardUser.id).role, sqlite.prepare('SELECT version FROM identity_admin_user_versions WHERE user_id=?').get(guardUser.id).version],
    [beforeFailure, 'teacher', 1], 'A failed change rolls back evidence, role and revision together');
  check((await principalForToken(sessions.atomic.split('=')[1]))?.id, guardUser.id, 'A failed change leaves existing sessions valid');
  sqlite.exec('DROP TRIGGER identity_change_test_failure');
  db.batch = async queries => { sqlite.prepare("UPDATE users SET disabled_at='revoked-during-request' WHERE id='admin-a'").run(); return originalBatch(queries); };
  check((await role('admin-a', guardUser.id, roleBody({ role: 'student' }))).status, 403, 'The actor is rechecked inside the actual write');
  check([events(), sqlite.prepare('SELECT role FROM users WHERE id=?').get(guardUser.id).role], [beforeFailure, 'teacher'], 'A revoked actor writes nothing');
  db.batch = originalBatch; sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='admin-a'").run();
  db.batch = async queries => { sqlite.prepare("UPDATE users SET role='guardian' WHERE id=?").run(guardUser.id); return originalBatch(queries); };
  check((await role('admin-a', guardUser.id, roleBody({ role: 'guardian' }))).status, 409, 'A role changed to the requested value during the request leaves nothing to apply');
  db.batch = originalBatch; sqlite.prepare("UPDATE users SET role='teacher' WHERE id=?").run(guardUser.id);
  db.batch = async queries => { sqlite.prepare("INSERT INTO classes(id,school_id,course_id,teacher_id,name,term,created_at,updated_at) VALUES ('late-class','a','course-a',?,'Late assignment','T1','x','x')").run(guardUser.id); return originalBatch(queries); };
  check((await role('admin-a', guardUser.id, roleBody({ role: 'student' }))).status, 409, 'A class assigned during the request blocks the role change at the actual write');
  db.batch = originalBatch; sqlite.prepare("DELETE FROM classes WHERE id='late-class'").run();
  db.batch = async queries => { sqlite.prepare("UPDATE users SET identity_issuer=?, identity_subject='raced-subject' WHERE id='legacy-b'").run(provider); return originalBatch(queries); };
  const unmappedLate = await identity('admin-a', 'legacy-unmapped', unlinkBody({ expectedVersion: 1 }));
  db.batch = originalBatch;
  check(unmappedLate.status, 200, 'Unlink proceeds when only an unrelated account changes concurrently');
  db.batch = async queries => { sqlite.prepare("INSERT INTO users(id,name,email,role,school_id,identity_issuer,identity_subject,created_at,updated_at) VALUES ('taker','Taker','taker@example.invalid','teacher','a',?,'taken-late','x','x')").run(provider); return originalBatch(queries); };
  response = await identity('admin-a', 'legacy-unmapped', linkBody({ expectedVersion: 2, identitySubject: 'taken-late' }));
  db.batch = originalBatch;
  check([response.status, (await response.json()).reason], [409, 'identity_in_use'], 'An identity taken during the request is a conflict, never an overwrite');
  check(sqlite.prepare("SELECT identity_subject FROM users WHERE id='taker'").get().identity_subject, 'taken-late', 'The competing owner keeps its identity');

  // ---- Administrator continuity under mutual demotion ---------------------------------------------------------------------
  const peer = await provision('admin-a', 'Reviewed peer administrator', 'peer-subject', { role: 'admin' });
  sessions.peer = (await createSession(peer.id)).split(';')[0];
  const mutual = await Promise.all([
    role('admin-a', peer.id, roleBody({ expectedVersion: 1, role: 'teacher' })),
    role('peer', 'admin-a', roleBody({ expectedVersion: sqlite.prepare("SELECT coalesce((SELECT version FROM identity_admin_user_versions WHERE user_id='admin-a'),0) AS v").get().v, role: 'teacher' })),
  ]);
  check(mutual.filter(result => result.status === 200).length, 1, 'Mutual demotion has exactly one winner');
  check(count('users', "school_id='a' AND role='admin' AND disabled_at IS NULL AND identity_issuer IS NOT NULL AND identity_subject IS NOT NULL"), 1, 'An enabled mapped administrator always remains');
  const survivor = sqlite.prepare("SELECT id FROM users WHERE school_id='a' AND role='admin' AND disabled_at IS NULL").get().id;
  const survivorActor = survivor === 'admin-a' ? 'admin-a' : 'peer';
  if (survivorActor === 'admin-a') sessions['admin-a'] = (await createSession('admin-a')).split(';')[0];
  response = await role(survivorActor, survivor, roleBody({ expectedVersion: 0, role: 'teacher' }));
  check([response.status, (await response.json()).reason], [409, 'self'], 'The surviving administrator cannot demote themselves');
  response = await identity(survivorActor, survivor, unlinkBody({ expectedVersion: 0 }));
  check(response.status, 409, 'The surviving administrator cannot unlink themselves');

  // ---- Synthetic installation isolation -----------------------------------------------------------------------------------
  bindings.SAHA_DEMO_ENABLED = 'true'; bindings.SAHA_DEMO_INSTALLATION_ID = '12345678-1234-4234-8234-123456789abc';
  check(policy.demoRuntimeAllowed(), true, 'The isolated synthetic runtime is enabled for these checks');
  response = await collection.POST(request(survivorActor, 'POST', { clientRequestId: uuid(), name: 'Foreign issuer', email: 'foreign-issuer@example.invalid', role: 'teacher',
    identityIssuer: provider, identitySubject: 'foreign-issuer-subject', reviewConfirmed: true, reason: why }));
  check([response.status, (await response.json()).reason], [409, 'demo_issuer'], 'A synthetic installation refuses a foreign issuer when provisioning');
  response = await identity(survivorActor, 'legacy-half', unlinkBody({ expectedVersion: 1 }));
  check([response.status, (await response.json()).reason], [409, 'demo_unlink'], 'A synthetic installation refuses unlinking, which would break its isolation');
  sqlite.prepare("UPDATE users SET identity_issuer=NULL, identity_subject=NULL WHERE id='legacy-b'").run();
  response = await identity(survivorActor, 'legacy-unmapped', linkBody({ expectedVersion: 3, identitySubject: 'demo-foreign' }));
  check([response.status, (await response.json()).reason], [409, 'demo_issuer'], 'A synthetic installation refuses a foreign issuer when linking');
  delete bindings.SAHA_DEMO_ENABLED; delete bindings.SAHA_DEMO_INSTALLATION_ID;
  check(policy.demoRuntimeAllowed(), false, 'Synthetic runtime settings are removed again');
  sqlite.prepare("INSERT INTO users(id,name,email,role,school_id,identity_issuer,identity_subject,created_at,updated_at) VALUES ('saha-demo-teacher','Fixed','fixed@example.invalid','teacher','a',?,'saha-demo-teacher','x','x')").run(policy.DEMO_ISSUER);
  response = await identity(survivorActor, 'saha-demo-teacher', unlinkBody({ expectedVersion: 0 }));
  check([response.status, (await response.json()).reason], [409, 'fixed_demo_account'], 'A fixed synthetic demo account keeps its sign-in identity');

  // ---- Production D1 prepared-statement driver ----------------------------------------------------------------------------
  const { drizzle: d1Drizzle } = await import('drizzle-orm/d1');
  function prepared(query, params = []) {
    return {
      bind(...values) { return prepared(query, values); },
      async run() { const result = sqlite.prepare(query).run(...params); return { success: true, results: [], meta: { changes: Number(result.changes) } }; },
      async all() { return { success: true, results: sqlite.prepare(query).all(...params), meta: {} }; },
      async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...params); },
    };
  }
  globalThis.__sahaTestDb = d1Drizzle({ prepare: prepared, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const item of statements) results.push(await item.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } }, { schema });
  const native = await provision(survivorActor, 'Reviewed native teacher', 'native-subject');
  response = await role(survivorActor, native.id, roleBody({ role: 'student' }));
  check([response.status, (await response.json()).user.role], [200, 'student'], 'The production D1 batch applies a role change');
  response = await identity(survivorActor, native.id, unlinkBody({ expectedVersion: 2 }));
  check([response.status, (await response.json()).user.identityIssuer], [200, null], 'The production D1 batch applies an unlink');
  response = await identity(survivorActor, native.id, linkBody({ expectedVersion: 3, identitySubject: 'native-relinked' }));
  check([response.status, (await response.json()).user.identitySubject], [200, 'native-relinked'], 'The production D1 batch applies a link');
  check(count('identity_admin_changes', `user_id='${native.id}'`), 3, 'The D1 driver appends exactly three immutable decisions');
  check(networkCalls, 0, 'Identity changes made no provider, network or notification request');
  console.log(`Reviewed identity lifecycle: ${checks} checks passed (actual sessions, atomic SQLite and production D1 prepared-batch driver; synthetic identities only).`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally { globalThis.fetch = originalFetch; sqlite.close(); }
