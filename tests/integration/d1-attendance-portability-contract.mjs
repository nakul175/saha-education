// Ordinary actual opaque-session attendance snapshots through production D1
// mapping. Native SQLite compilation enforces expression depth100 before data
// execution; calibration failures and fail-first runs earn no passing credit.
import { isDeepStrictEqual } from 'node:util';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/d1';
import { bindings, freshDatabase, load, root, stamp } from '../support/security-db.mjs';

const origin = 'https://education.example.invalid';
const originalFetch = globalThis.fetch;
let fixture, passed = 0, scenarios = 0, externalRequests = 0;
class PortabilityFailure extends Error {
  constructor(label) { super(label); this.name = 'PortabilityFailure'; }
}
const check = (actual, expected, label) => {
  if (!isDeepStrictEqual(actual, expected)) throw new PortabilityFailure(label);
  passed++;
};

// The same native C prepare method as the dashboard portability contract.
// Python receives placeholder SQL/schema only, never session or bind values.
const nativeCompiler = `import _sqlite3,ctypes,ctypes.util,json,pathlib,sys
database=None
try:
 data=json.load(sys.stdin);lib=ctypes.CDLL(getattr(_sqlite3,'__file__',None) or ctypes.util.find_library('sqlite3'))
 lib.sqlite3_open.argtypes=[ctypes.c_char_p,ctypes.POINTER(ctypes.c_void_p)];lib.sqlite3_open.restype=ctypes.c_int
 lib.sqlite3_exec.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.POINTER(ctypes.c_char_p)];lib.sqlite3_exec.restype=ctypes.c_int
 lib.sqlite3_limit.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int];lib.sqlite3_limit.restype=ctypes.c_int
 lib.sqlite3_prepare_v2.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_int,ctypes.POINTER(ctypes.c_void_p),ctypes.POINTER(ctypes.c_char_p)];lib.sqlite3_prepare_v2.restype=ctypes.c_int
 lib.sqlite3_errmsg.argtypes=[ctypes.c_void_p];lib.sqlite3_errmsg.restype=ctypes.c_char_p
 lib.sqlite3_finalize.argtypes=[ctypes.c_void_p];lib.sqlite3_close.argtypes=[ctypes.c_void_p]
 database=ctypes.c_void_p()
 if lib.sqlite3_open(b':memory:',ctypes.byref(database)):raise RuntimeError()
 for migration in sorted(pathlib.Path(data['migrations']).glob('[0-9]*.sql')):
  error=ctypes.c_char_p()
  if lib.sqlite3_exec(database,migration.read_text().replace('--> statement-breakpoint','').encode(),None,None,ctypes.byref(error)):raise RuntimeError()
 for category,cap in [(1,100000),(2,100),(3,100),(4,5),(5,25000),(6,32),(8,50),(9,100)]:lib.sqlite3_limit(database,category,cap)
 statement=ctypes.c_void_p();tail=ctypes.c_char_p();query=data['query'].encode()
 result=lib.sqlite3_prepare_v2(database,query,len(query),ctypes.byref(statement),ctypes.byref(tail))
 message=lib.sqlite3_errmsg(database).decode().lower() if result else ''
 if statement:lib.sqlite3_finalize(statement)
 classification='ExpressionDepth' if 'expression tree' in message else 'FunctionArguments' if 'too many arguments' in message else 'VDBECompileAllocation' if result==7 else 'OtherSQLitePrepare' if result else None
 print(json.dumps({'ok':result==0,'classification':classification}))
except BaseException:print(json.dumps({'ok':False,'classification':'Environment'}))
finally:
 if database:
  try:lib.sqlite3_close(database)
  except BaseException:pass
`;
function compile(query) {
  const result = spawnSync('python3', ['-c', nativeCompiler], { input: JSON.stringify({ query, migrations: join(root, 'drizzle') }), encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw new PortabilityFailure('Native compilation process unavailable');
  try { return JSON.parse(result.stdout); } catch { throw new PortabilityFailure('Native compiler returned no safe classification'); }
}
const metrics = [];
let bounded = false, executions = 0, activeRole = null, prepareFailure = null;
function portable(query, parameters) {
  check(Buffer.byteLength(query) <= 100000, true, 'Attendance SQL fits runtime byte limit');
  check(parameters.length <= 100, true, 'Attendance SQL fits runtime bind limit');
  const patterns = [...query.matchAll(/\b(?:glob|like)\s+'((?:''|[^'])*)'/gi)].map(match => match[1].replaceAll("''", "'"));
  for (const pattern of patterns) check(Buffer.byteLength(pattern) <= 50, true, 'Attendance date pattern fits runtime literal pattern limit');
  const prepared = compile(query);
  if (!prepared.ok) { prepareFailure = prepared.classification; throw new PortabilityFailure('Actual attendance statement runtime prepare: ' + prepared.classification); }
  passed++; metrics.push({ sqlBytes: Buffer.byteLength(query), boundParameters: parameters.length }); executions++;
}
function prepare(query, parameters = []) {
  return { bind(...values) { return prepare(query, values); },
    async raw() { if (bounded) portable(query, parameters); const statement = fixture.sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...parameters); },
    async all() { return { success: true, results: fixture.sqlite.prepare(query).all(...parameters), meta: {} }; },
    async run() { const statement = fixture.sqlite.prepare(query); if (statement.columns().length) return { success: true, results: statement.all(...parameters), meta: {} }; const result = statement.run(...parameters); return { success: true, results: [], meta: { changes: Number(result.changes) } }; },
  };
}

try {
  globalThis.fetch = async () => { externalRequests++; throw new PortabilityFailure('External requests forbidden'); };
  fixture = freshDatabase();
  globalThis.__sahaTestDb = drizzle({ prepare, async batch(statements) {
    fixture.sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); fixture.sqlite.exec('COMMIT'); return results; }
    catch (error) { fixture.sqlite.exec('ROLLBACK'); throw error; }
  } }, { schema: fixture.schema });
  bindings.SAHA_ALLOWED_ORIGINS = origin; bindings.SAHA_DEMO_ENABLED = 'true'; bindings.SAHA_DEMO_INSTALLATION_ID = 'b0946f05-34bf-4b58-9148-9bc171771ac7';
  const demo = await load('app/api/demo/route.ts'), session = await load('lib/education/session.ts');
  const service = await load('lib/education/attendance-summary.ts'), legacy = await load('lib/education/attendance.ts');
  const actors = {};
  for (const role of ['admin', 'teacher', 'guardian', 'student']) {
    const response = await demo.POST(new Request(origin + '/api/demo', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ role, syntheticAcknowledged: true }) }));
    check(response.status, 200, 'Real ordinary fixed-role demo entry succeeds'); const cookie = response.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new PortabilityFailure('Real demo returned no opaque session');
    actors[role] = await session.principalForToken(cookie.slice(cookie.indexOf('=') + 1)); check(actors[role]?.role, role, 'Actual opaque session resolves its selected role');
  }
  // Calibrations establish genuine limits, but expected runtime errors are not
  // successful application checks and never increment the passing counter.
  if (compile('select ' + Array(102).fill('1').join(' + ')).classification !== 'ExpressionDepth') throw new PortabilityFailure('Native expression-depth100 calibration unavailable');
  if (compile('select json_array(' + Array(33).fill('1').join(',') + ')').classification !== 'FunctionArguments') throw new PortabilityFailure('Native function-argument32 calibration unavailable');
  const tables = ['schools', 'users', 'students', 'guardians', 'student_guardians', 'courses', 'classes', 'enrolments', 'attendance'];
  const rows = () => tables.map(table => fixture.sqlite.prepare('SELECT * FROM "' + table + '" ORDER BY rowid').all());
  async function constrained(role, classId = 'saha-demo-class') {
    activeRole = role;
    bounded = false; const ordinary = await service.getAttendanceSummary(actors[role], classId);
    const before = executions; bounded = true; let limited;
    try { limited = await service.getAttendanceSummary(actors[role], classId); } finally { bounded = false; }
    check(executions - before, 1, 'Current scope names counts and date evidence use one constrained production D1 SELECT');
    check(limited && { ...limited, asOf: null }, ordinary && { ...ordinary, asOf: null }, 'Runtime bounds preserve complete ordinary scope and evidence'); scenarios++;
    return limited;
  }
  const originalRows = rows(), views = {};
  for (const role of ['admin', 'teacher', 'guardian', 'student']) {
    views[role] = await constrained(role);
    check(views[role]?.role, role, 'Prepared role snapshot retains actual current role');
    check(views[role]?.class, { id: 'saha-demo-class', name: 'Reading circle' }, 'Actual seeded class is identified');
    check(views[role]?.pupils.total, role === 'student' ? 1 : role === 'guardian' ? 2 : 3, 'Exact pupil count retains ordinary role scope');
    check(views[role]?.pupils.items.length, views[role]?.pupils.total, 'Small seeded roster has no unexplained omission');
    check(views[role]?.pupils.truncated, false, 'Small roster truncation remains truthful');
    check(views[role]?.pupils.limit, 100, 'Existing pupil cap is unchanged');
    check(new Date(views[role].asOf).toISOString(), views[role].asOf, 'Single SQL snapshot supplies canonical current time');
    for (const pupil of views[role].pupils.items) {
      check(Object.keys(pupil).sort(), ['admissionNumber', 'attendance', 'currentActive', 'firstName', 'id', 'lastName'], 'Projection retains names while excluding notes and private identity');
      check(Object.hasOwn(pupil.attendance, 'percentage'), false, 'No attendance denominator or policy is introduced');
    }
  }
  check(rows(), originalRows, 'Four role reads preserve every existing synthetic domain row');
  check(views.guardian.pupils.items.map(pupil => pupil.id).sort(), ['saha-demo-learner-1', 'saha-demo-learner-2'], 'Guardian sees only current explicitly linked pupils');
  check(views.student.pupils.items.map(pupil => pupil.id), ['saha-demo-learner-1'], 'Student sees only its current profile');
  check(views.student.pupils.items[0].attendance.counts, { present: 1, absent: 0, late: 0, excused: 0, other: 0 }, 'Actual seeded attendance remains raw status evidence');
  check(views.guardian.pupils.items.find(pupil => pupil.id === 'saha-demo-learner-2').attendance.counts.late, 1, 'Linked second pupil retains recorded lateness');
  check(views.teacher.pupils.items.find(pupil => pupil.id === 'saha-demo-learner-3').attendance.recordedRows, 0, 'No-data pupil receives no default attendance');

  fixture.sqlite.prepare('INSERT INTO classes(id,school_id,course_id,teacher_id,name,term,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('portability-other-class', 'saha-demo-school', 'saha-demo-course', 'saha-demo-teacher', 'Other synthetic class', 'Demo term', stamp, stamp);
  const insert = fixture.sqlite.prepare('INSERT INTO attendance(id,class_id,student_id,date,status,note,recorded_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?, ?,?)');
  insert.run('portability-ineligible-class-row', 'portability-other-class', 'saha-demo-learner-1', '2026-01-01', 'absent', 'PRIVATE_NOTE', 'saha-demo-teacher', stamp, stamp);
  insert.run('portability-invalid-date', 'saha-demo-class', 'saha-demo-learner-1', '2026-02-30', 'legacy unknown', 'PRIVATE_NOTE', 'saha-demo-teacher', stamp, stamp);
  insert.run('portability-unlinked-pupil', 'saha-demo-class', 'saha-demo-learner-3', '2026-01-02', 'absent', 'PRIVATE_NOTE', 'saha-demo-teacher', stamp, stamp);
  const controlRows = rows();
  for (const role of ['admin', 'teacher', 'guardian', 'student']) {
    const view = await constrained(role), existing = await legacy.listAttendance(actors[role], { classId: 'saha-demo-class' });
    check(view.pupils.items.reduce((sum, pupil) => sum + pupil.attendance.recordedRows, 0), existing.length, 'Constrained observed row total matches unchanged legacy scope');
    const first = view.pupils.items.find(pupil => pupil.id === 'saha-demo-learner-1');
    check(first.attendance.counts.absent, 0, 'Other-class absence cannot affect selected-class evidence');
    check(first.attendance.invalidDateRows, 1, 'Malformed stored date remains disclosed');
    check(first.attendance.counts.other, 1, 'Unknown legacy status remains raw counted evidence');
    check(JSON.stringify(view).includes('PRIVATE_NOTE'), false, 'Legacy notes stay private');
  }
  for (const role of ['guardian', 'student']) {
    check(await constrained(role, 'portability-other-class'), null, 'No active family membership means unavailable class without cached evidence');
    const view = await constrained(role);
    check(view.pupils.items.some(pupil => pupil.id === 'saha-demo-learner-3'), false, 'Unlinked classmate cannot broaden family pupil scope');
  }
  for (const role of ['admin', 'teacher', 'guardian', 'student']) check(await constrained(role, 'missing-synthetic-class'), null, 'Missing class is unavailable under genuine runtime preparation');
  check(rows(), controlRows, 'Scoped portability reads never repair discard or mutate original data');
  check(externalRequests, 0, 'No provider or recipient requests');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, scenarios, attendanceStatements: executions, statementMetrics: metrics, externalRequests,
    uncountedCalibrations: ['ExpressionDepth100 expected-error observed', 'FunctionArguments32 expected-error observed'],
    limits: 'Native SQLite C prepare with expression100/function32/SQL100KB/bind100 and literal-pattern50 checks, followed by actual production D1 mapping over SQLite. Synthetic opaque sessions only; no Worker/browser, races, provider or acceptance evidence.' }));
} catch (error) {
  console.error(JSON.stringify({ passed, failed: 1, skipped: 0, failureClass: error.name, role: activeRole, prepareFailure, detail: error instanceof PortabilityFailure ? error.message : 'Underlying query and parameter details deliberately withheld.' })); process.exitCode = 1;
} finally { fixture?.sqlite.close(); globalThis.fetch = originalFetch; }
