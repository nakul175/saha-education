// Hosted-D1 portability of the assessment lifecycle and report-compile SQL. Every statement the new routes execute is recorded
// through the real route handlers and then PREPARED by native SQLite with the hosted limits (expression depth 100, 32 function
// arguments, 5 compound terms, 100 KB SQL, 100 bound parameters). The migration must also apply as one-statement pieces.
// Calibration statements prove the native compiler really enforces each limit; nothing here touches a network.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bindings, freshDatabase, seedSecurityData, load, root, stamp } from '../support/security-db.mjs';

const origin = 'https://education.example.invalid'; bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = await load('lib/education/session.ts');
const routes = {
  reports: await load('app/api/report-cards/route.ts'), report: await load('app/api/report-cards/[id]/route.ts'), detail: await load('app/api/report-cards/[id]/detail/route.ts'),
  eligible: await load('app/api/report-cards/eligible/route.ts'), lifecycle: await load('app/api/assessments/[id]/lifecycle/route.ts'), overview: await load('app/api/assessments/overview/route.ts'),
  assessment: await load('app/api/assessments/[id]/route.ts'), assessments: await load('app/api/assessments/route.ts'), legacy: await load('app/api/assessments/[id]/results/route.ts'),
};
const parameters = id => ({ params: Promise.resolve({ id }) });
let passed = 0, networkCalls = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
globalThis.fetch = async () => { networkCalls++; throw new Error('Portability contracts are offline only.'); };

// Native SQLite prepare with the hosted limits. Receives placeholder SQL and the migrated schema only, never bind values.
const nativeCompiler = `import _sqlite3,ctypes,json,pathlib,sys
database=None
try:
 data=json.load(sys.stdin);lib=ctypes.CDLL(_sqlite3.__file__)
 lib.sqlite3_open.argtypes=[ctypes.c_char_p,ctypes.POINTER(ctypes.c_void_p)];lib.sqlite3_open.restype=ctypes.c_int
 lib.sqlite3_exec.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.POINTER(ctypes.c_char_p)];lib.sqlite3_exec.restype=ctypes.c_int
 lib.sqlite3_limit.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int];lib.sqlite3_limit.restype=ctypes.c_int
 lib.sqlite3_prepare_v2.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_int,ctypes.POINTER(ctypes.c_void_p),ctypes.POINTER(ctypes.c_char_p)];lib.sqlite3_prepare_v2.restype=ctypes.c_int
 lib.sqlite3_errmsg.argtypes=[ctypes.c_void_p];lib.sqlite3_errmsg.restype=ctypes.c_char_p
 lib.sqlite3_finalize.argtypes=[ctypes.c_void_p];lib.sqlite3_close.argtypes=[ctypes.c_void_p]
 database=ctypes.c_void_p()
 if lib.sqlite3_open(b':memory:',ctypes.byref(database)):raise RuntimeError()
 files=sorted(pathlib.Path(data['migrations']).glob('[0-9]*.sql'))
 last=next((f for f in files if f.name==data['pieceFile']),None) if data['pieceFile'] else None
 for migration in files:
  if migration==last:break
  error=ctypes.c_char_p()
  if lib.sqlite3_exec(database,migration.read_text().replace('--> statement-breakpoint','').encode(),None,None,ctypes.byref(error)):raise RuntimeError()
 pieces=0
 if last:
  for piece in [p.strip() for p in last.read_text().split('--> statement-breakpoint') if p.strip()]:
   statement=ctypes.c_void_p();tail=ctypes.c_char_p();raw=piece.encode()
   result=lib.sqlite3_prepare_v2(database,raw,len(raw),ctypes.byref(statement),ctypes.byref(tail))
   if result:raise RuntimeError('piece '+str(pieces)+': '+lib.sqlite3_errmsg(database).decode())
   if (tail.value or b'').strip():raise RuntimeError('piece '+str(pieces)+' holds more than one statement')
   lib.sqlite3_finalize(statement);error=ctypes.c_char_p()
   if lib.sqlite3_exec(database,raw,None,None,ctypes.byref(error)):raise RuntimeError('piece '+str(pieces)+' failed to apply')
   pieces+=1
  print(json.dumps({'ok':True,'pieces':pieces}));sys.exit(0)
 for category,cap in [(1,100000),(2,100),(3,100),(4,5),(5,25000),(6,32),(8,50),(9,100)]:lib.sqlite3_limit(database,category,cap)
 statement=ctypes.c_void_p();tail=ctypes.c_char_p();query=data['query'].encode()
 result=lib.sqlite3_prepare_v2(database,query,len(query),ctypes.byref(statement),ctypes.byref(tail))
 message=lib.sqlite3_errmsg(database).decode().lower() if result else ''
 if statement:lib.sqlite3_finalize(statement)
 classification='ExpressionDepth' if 'expression tree' in message else 'FunctionArguments' if 'too many arguments' in message else 'CompoundSelect' if 'too many terms' in message else 'OtherSQLitePrepare' if result else None
 print(json.dumps({'ok':result==0,'classification':classification,'message':message}))
except SystemExit:pass
except BaseException as error:print(json.dumps({'ok':False,'classification':'Environment','message':str(error)}))
finally:
 if database:
  try:lib.sqlite3_close(database)
  except BaseException:pass
`;
function native(input) {
  const result = spawnSync('python3', ['-c', nativeCompiler], { input: JSON.stringify({ migrations: join(root, 'drizzle'), pieceFile: null, query: '', ...input }), encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, 'Native compiler process available'); return JSON.parse(result.stdout);
}

// ---- Calibration: the compiler must reject statements beyond each hosted limit, or a pass would prove nothing. ----
const nest = depth => 'select ' + Array.from({ length: depth }, () => '1').join('+');
const calibration = [
  ['expression depth 101', nest(101), 'ExpressionDepth', false], ['expression depth 90', nest(90), null, true],
  ['34 function arguments', 'select json_object(' + Array.from({ length: 17 }, (_, i) => "'k" + i + "',1").join(',') + ')', 'FunctionArguments', false],
  ['32 function arguments', 'select json_object(' + Array.from({ length: 16 }, (_, i) => "'k" + i + "',1").join(',') + ')', null, true],
  ['6 compound terms', Array.from({ length: 6 }, () => 'select 1').join(' union all '), 'CompoundSelect', false], ['5 compound terms', Array.from({ length: 5 }, () => 'select 1').join(' union all '), null, true],
];
for (const [label, query, classification, ok] of calibration) { const result = native({ query }); check([label, result.ok, result.classification], [label, ok, classification], 'Calibration: ' + label); }

// ---- The migration applies as one-statement pieces (the hosted runner applies each piece on its own). ----
const migrationFile = readdirSync(join(root, 'drizzle')).filter(file => /^0020.*\.sql$/.test(file));
check(migrationFile.length, 1, 'Exactly one 0020 migration');
const pieces = native({ pieceFile: migrationFile[0] });
check([pieces.ok, pieces.pieces >= 20], [true, true], 'Migration 0020 applies as single-statement pieces: ' + JSON.stringify(pieces));
const expectedPieces = readFileSync(join(root, 'drizzle', migrationFile[0]), 'utf8').split('--> statement-breakpoint').filter(piece => piece.trim()).length;
check(pieces.pieces, expectedPieces, 'Every migration piece was prepared and applied');
const triggerPieces = readFileSync(join(root, 'drizzle', migrationFile[0]), 'utf8').split('--> statement-breakpoint').filter(piece => /CREATE TRIGGER/i.test(piece));
check(triggerPieces.every(piece => (piece.match(/CREATE TRIGGER/gi) ?? []).length === 1), true, 'One trigger per piece');
const journal = JSON.parse(readFileSync(join(root, 'drizzle/meta/_journal.json'), 'utf8')).entries.find(entry => entry.tag.startsWith('0020'));
check([journal?.idx, journal?.when], [20, 1792000020000], 'Journal entry for 0020 is registered with its reserved index and unique time');

// ---- Record every statement the new routes run, through the real handlers. ----
const { db, schema, sqlite } = freshDatabase(); await seedSecurityData(db, schema);
await db.insert(schema.students).values({ id: 'student-a2', schoolId: 'a', userId: null, firstName: 'student-a2', lastName: 'Synthetic', dateOfBirth: '2012-02-02', admissionNumber: 'student-a2', gradeLevel: '8', createdAt: stamp, updatedAt: stamp });
await db.insert(schema.enrolments).values({ id: 'student-a2-enrolment', studentId: 'student-a2', classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp });
await db.insert(schema.assessments).values({ id: 'assessment-a2', classId: 'class-a', title: 'Synthetic project', kind: 'project', maxScore: 50, date: '2026-10-07', createdAt: stamp, updatedAt: stamp });
await db.insert(schema.assessmentResults).values([['r1', 'assessment-a', 'student-a', 0], ['r2', 'assessment-a', 'student-a2', 15], ['r3', 'assessment-a2', 'student-a', 40]].map(([id, assessmentId, studentId, score]) => ({ id, assessmentId, studentId, score, grade: 'G', feedback: 'private', createdAt: stamp, updatedAt: stamp })));
const cookies = {};
for (const actor of ['admin-a', 'teacher-a', 'guardian-a']) cookies[actor] = (await sessions.createSession(actor)).split(';')[0];
const request = (actor, method, path, data) => new Request(origin + path, { method, headers: { cookie: cookies[actor], origin, ...(data === undefined ? {} : { 'content-type': 'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });

const recorded = new Map();
const original = sqlite.prepare.bind(sqlite);
sqlite.prepare = text => {
  const statement = original(text);
  return new Proxy(statement, { get(target, property) {
    const value = target[property];
    if (!['run', 'get', 'all'].includes(property)) return typeof value === 'function' ? value.bind(target) : value;
    return (...args) => { const entry = recorded.get(text) ?? { count: 0, maxParameters: 0 }; entry.count++; entry.maxParameters = Math.max(entry.maxParameters, args.length); recorded.set(text, entry); return value.apply(target, args); };
  } });
};
const expectStatus = async (promise, expected, message) => { const response = await promise; check(response.status, expected, message); return response.json(); };
const uuid = () => crypto.randomUUID();
await expectStatus(routes.overview.GET(request('teacher-a', 'GET', '/api/assessments/overview')), 200, 'overview');
await expectStatus(routes.overview.GET(request('admin-a', 'GET', '/api/assessments/overview?classId=class-a')), 200, 'overview filtered');
await expectStatus(routes.lifecycle.GET(request('teacher-a', 'GET', '/api/assessments/assessment-a/lifecycle'), parameters('assessment-a')), 200, 'lifecycle read');
await expectStatus(routes.lifecycle.POST(request('teacher-a', 'POST', '/api/assessments/assessment-a/lifecycle', { clientRequestId: uuid(), action: 'publish' }), parameters('assessment-a')), 201, 'publish');
const publishId = uuid();
await expectStatus(routes.lifecycle.POST(request('teacher-a', 'POST', '/api/assessments/assessment-a2/lifecycle', { clientRequestId: publishId, action: 'publish', partialConfirmed: true }), parameters('assessment-a2')), 201, 'publish second');
await expectStatus(routes.lifecycle.POST(request('teacher-a', 'POST', '/api/assessments/assessment-a2/lifecycle', { clientRequestId: publishId, action: 'publish', partialConfirmed: true }), parameters('assessment-a2')), 200, 'publish replay');
const created = await expectStatus(routes.assessments.POST(request('teacher-a', 'POST', '/api/assessments', { classId: 'class-a', title: 'Synthetic new', kind: 'quiz', maxScore: 10, date: '2026-10-09' })), 201, 'create');
const live = await (await routes.lifecycle.GET(request('teacher-a', 'GET', '/api/assessments/' + created.id + '/lifecycle'), parameters(created.id))).json();
await expectStatus(routes.assessment.PATCH(request('teacher-a', 'PATCH', '/api/assessments/' + created.id, { clientRequestId: uuid(), expected: { title: live.assessment.title, kind: live.assessment.kind, maxScore: live.assessment.maxScore, date: live.assessment.date, updatedAt: live.assessment.updatedAt }, details: { title: 'Synthetic renamed', kind: 'exam', maxScore: 12, date: '2026-10-10' } }), parameters(created.id)), 201, 'revise');
await expectStatus(routes.eligible.GET(request('admin-a', 'GET', '/api/report-cards/eligible?studentId=student-a')), 200, 'eligible');
const draft = await expectStatus(routes.reports.POST(request('admin-a', 'POST', '/api/report-cards', { studentId: 'student-a', term: 'T9', overallGrade: 'A', assessmentIds: ['assessment-a', 'assessment-a2'] })), 201, 'compile');
await expectStatus(routes.detail.GET(request('admin-a', 'GET', '/api/report-cards/' + draft.id + '/detail'), parameters(draft.id)), 200, 'detail staff');
await expectStatus(routes.report.PATCH(request('admin-a', 'PATCH', '/api/report-cards/' + draft.id, { publish: true }), parameters(draft.id)), 200, 'publish report');
await expectStatus(routes.detail.GET(request('guardian-a', 'GET', '/api/report-cards/' + draft.id + '/detail'), parameters(draft.id)), 200, 'detail family');
const replacement = await expectStatus(routes.reports.POST(request('admin-a', 'POST', '/api/report-cards', { studentId: 'student-a', term: 'T9 fixed', overallGrade: 'A', assessmentIds: ['assessment-a'], correction: { reportId: draft.id, reason: 'Synthetic correction reason' } })), 201, 'compile correction');
await expectStatus(routes.detail.GET(request('admin-a', 'GET', '/api/report-cards/' + replacement.id + '/detail'), parameters(replacement.id)), 200, 'detail replacement');
sqlite.prepare = original;

// ---- Every recorded statement fits the hosted limits and prepares natively under them. ----
const statements = [...recorded.entries()].filter(([text]) => /^\s*(select|with|insert|update|delete)\b/i.test(text));
check(statements.length > 20, true, 'The routes executed a representative statement set: ' + statements.length);
const queryNames = [];
for (const [text, entry] of statements) {
  check(Buffer.byteLength(text) <= 100000, true, 'SQL fits the 100 KB statement limit');
  check(entry.maxParameters <= 100, true, 'Statement binds at most 100 parameters (' + entry.maxParameters + ')');
  const result = native({ query: text });
  if (!result.ok) queryNames.push(text.slice(0, 120) + ' => ' + result.classification + ': ' + result.message);
  check(result.ok, true, 'Hosted-limit prepare succeeds: ' + text.slice(0, 80).replace(/\s+/g, ' '));
}
check(queryNames, [], 'No statement exceeds expression depth, function arguments or compound-select limits');
check(networkCalls, 0, 'No network call');
console.log(JSON.stringify({ passed, failed: 0, skipped: 0, statements: statements.length, migrationPieces: pieces.pieces, networkCalls, scope: 'recorded production SQL prepared by native SQLite with hosted limits; actual hosted D1 runner not available in this sandbox' }));
