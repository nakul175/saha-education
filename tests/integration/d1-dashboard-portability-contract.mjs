// Ordinary synthetic demo snapshots over real opaque sessions and production
// Drizzle D1 mapping. Python's SQLite C API compiles each dashboard statement
// with the runtime's expression/function/byte/bind limits before Node executes
// it. No Worker, browser, provider, authority race or parameter-value output.
import { isDeepStrictEqual } from 'node:util';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/d1';
import { bindings, freshDatabase, load, root, stamp } from '../support/security-db.mjs';

const origin = 'https://education.example.invalid';
const originalFetch = globalThis.fetch;
let passed = 0, externalRequests = 0, fixture;
class PortabilityFailure extends Error {
  constructor(label) { super(label); this.name = 'PortabilityFailure'; }
}
function check(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected)) throw new PortabilityFailure(label);
  passed++;
}

// Python 3.9 lacks Connection.setlimit. Use its loaded SQLite C API directly.
// The child receives SQL with placeholders and a schema directory, never bind
// values or tokens. It prepares, finalizes and closes; it emits classifications
// only. Unsupported C exports are a failure, never a silent portability pass.
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
 for migration in sorted(pathlib.Path(data['migrations']).glob('[0-9]*.sql')):
  error=ctypes.c_char_p()
  if lib.sqlite3_exec(database,migration.read_text().replace('--> statement-breakpoint','').encode(),None,None,ctypes.byref(error)):raise RuntimeError()
 # SQLite C limit category numbers: SQL length, columns, expression depth,
 # compound selects, VDBE ops, function args, pattern length and bind count.
 for category,cap in [(1,100000),(2,100),(3,100),(4,5),(5,25000),(6,32),(8,50),(9,100)]:
  lib.sqlite3_limit(database,category,cap)
 statement=ctypes.c_void_p();tail=ctypes.c_char_p();query=data['query'].encode()
 result=lib.sqlite3_prepare_v2(database,query,len(query),ctypes.byref(statement),ctypes.byref(tail))
 message=lib.sqlite3_errmsg(database).decode().lower() if result else ''
 if statement:lib.sqlite3_finalize(statement)
 classification='ExpressionDepth' if 'expression tree' in message else 'FunctionArguments' if 'too many arguments' in message else 'VDBECompileAllocation' if result==7 else 'OtherSQLitePrepare' if result else None
 print(json.dumps({'ok':result==0,'errorClass':('SQLitePrepareError'+str(result)) if result else None,'classification':classification}))
except BaseException:
 print(json.dumps({'ok':False,'errorClass':'NativeCompilerUnavailable','classification':'Environment'}))
finally:
 if database:
  try:lib.sqlite3_close(database)
  except BaseException:pass
`;
function compile(query) {
  const result = spawnSync('python3', ['-c', nativeCompiler], {
    input: JSON.stringify({ query, migrations: join(root, 'drizzle') }), encoding: 'utf8', timeout: 10000,
  });
  if (result.status !== 0) throw new PortabilityFailure('Native compiler process unavailable');
  try { return JSON.parse(result.stdout); }
  catch { throw new PortabilityFailure('Native compiler returned no safe result'); }
}
function enforcePortableQuery(query, parameters) {
  check(Buffer.byteLength(query) <= 100000, true, 'Dashboard SQL exceeds 100KB');
  check(parameters.length <= 100, true, 'Dashboard exceeds 100 bound parameters');
  // Native prepare alone does not evaluate GLOB. This statement's patterns are
  // SQL literals; check their decoded byte lengths before normal data execution.
  const patterns = [...query.matchAll(/\b(?:glob|like)\s+'((?:''|[^'])*)'/gi)].map(match => match[1].replaceAll("''", "'"));
  for (const pattern of patterns) check(Buffer.byteLength(pattern) <= 50, true, 'Dashboard literal pattern exceeds 50 bytes');
  const prepared = compile(query);
  if (!prepared.ok) throw new PortabilityFailure('Runtime compilation failed: ' + prepared.errorClass + '/' + prepared.classification);
  passed++;
}

try {
  globalThis.fetch = async () => { externalRequests++; throw new PortabilityFailure('External request forbidden'); };
  fixture = freshDatabase();
  let bounded = false, executions = 0;
  const metrics = [];
  function prepare(query, parameters = []) {
    return {
      bind(...values) { return prepare(query, values); },
      async raw() {
        if (bounded) {
          enforcePortableQuery(query, parameters);
          metrics.push({ sqlBytes: Buffer.byteLength(query), boundParameters: parameters.length }); executions++;
        }
        const statement = fixture.sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...parameters);
      },
      async all() { return { success: true, results: fixture.sqlite.prepare(query).all(...parameters), meta: {} }; },
      async run() {
        const statement = fixture.sqlite.prepare(query);
        if (statement.columns().length) return { success: true, results: statement.all(...parameters), meta: {} };
        const result = statement.run(...parameters); return { success: true, results: [], meta: { changes: Number(result.changes) } };
      },
    };
  }
  globalThis.__sahaTestDb = drizzle({ prepare, async batch(statements) {
    fixture.sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); fixture.sqlite.exec('COMMIT'); return results; }
    catch (error) { fixture.sqlite.exec('ROLLBACK'); throw error; }
  } }, { schema: fixture.schema });
  bindings.SAHA_ALLOWED_ORIGINS = origin; bindings.SAHA_DEMO_ENABLED = 'true';
  bindings.SAHA_DEMO_INSTALLATION_ID = '908df258-dff2-43d4-a540-503b2c7e7d13';
  const demo = await load('app/api/demo/route.ts'), session = await load('lib/education/session.ts'), dashboard = await load('lib/education/dashboard.ts');
  const actors = {};
  for (const role of ['admin', 'teacher', 'guardian', 'student']) {
    const response = await demo.POST(new Request(origin + '/api/demo', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ role, syntheticAcknowledged: true }) }));
    check(response.status, 200, 'Ordinary real demo sign-in succeeds');
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new PortabilityFailure('Demo returned no ordinary secure session');
    const actor = await session.principalForToken(cookie.slice(cookie.indexOf('=') + 1));
    check(actor?.role, role, 'Real demo session resolves its selected ordinary role'); actors[role] = actor;
  }

  // Ordinary static scope controls: an unrelated existing pupil, unpublished
  // report and attendance in a class with no current family membership.
  fixture.sqlite.prepare('INSERT INTO report_cards (id,student_id,term,overall_grade,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run('portability-unlinked-report', 'saha-demo-learner-3', 'Synthetic other report', 'Sample', stamp, stamp, stamp);
  fixture.sqlite.prepare('INSERT INTO classes (id,school_id,course_id,teacher_id,name,term,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('portability-other-class', 'saha-demo-school', 'saha-demo-course', 'saha-demo-teacher', 'Synthetic other class', 'Demo term', stamp, stamp);
  fixture.sqlite.prepare('INSERT INTO attendance (id,class_id,student_id,date,status,recorded_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('portability-other-attendance', 'portability-other-class', 'saha-demo-learner-1', '2026-01-01', 'absent', 'saha-demo-teacher', stamp, stamp);
  const tables = ['schools', 'users', 'students', 'guardians', 'student_guardians', 'courses', 'classes', 'enrolments', 'attendance', 'report_cards'];
  const rows = () => tables.map(table => fixture.sqlite.prepare('SELECT * FROM "' + table + '" ORDER BY rowid').all());
  const originalRows = rows();

  check(compile('select ' + Array(102).fill('1').join(' + ')).classification, 'ExpressionDepth', 'Native expression-depth100 calibration');
  check(compile('select json_array(' + Array(33).fill('1').join(',') + ')').classification, 'FunctionArguments', 'Native function32 calibration');
  const views = {};
  for (const role of ['admin', 'teacher', 'guardian', 'student']) {
    bounded = false; const ordinary = await dashboard.getRoleDashboard(actors[role]);
    const before = executions; bounded = true; const limited = await dashboard.getRoleDashboard(actors[role]); bounded = false;
    check(executions - before, 1, 'Each constrained role snapshot executes one actual D1 statement');
    check(limited?.role, role, 'Constrained snapshot retains its ordinary role');
    check({ ...limited, asOf: null }, { ...ordinary, asOf: null }, 'Runtime limits preserve the complete ordinary snapshot');
    check(typeof limited.asOf, 'string', 'Current SQL snapshot time remains present'); views[role] = limited;
  }
  check(views.guardian.profiles.items.map(row => row.id).sort(), ['saha-demo-learner-1', 'saha-demo-learner-2'], 'Guardian retains only explicitly linked profiles');
  check(views.student.profiles.items.map(row => row.id), ['saha-demo-learner-1'], 'Student retains only its own linked profile');
  for (const role of ['guardian', 'student']) {
    const profile = views[role].profiles.items.find(row => row.id === 'saha-demo-learner-1');
    check(profile.attendance.recordedRows, 1, 'Currently ineligible other-class attendance is excluded');
    check(profile.attendance.counts.absent, 0, 'Other-class absence does not alter eligible observed evidence');
    check(profile.reports.items.map(row => row.id), ['saha-demo-report-published'], 'Only current published own-profile report is shown');
  }
  check(views.guardian.profiles.items.find(row => row.id === 'saha-demo-learner-2').reports.total, 0, 'Linked learner draft stays private');
  check(rows(), originalRows, 'Ordinary dashboard reads preserve every synthetic domain row');
  check(externalRequests, 0, 'Ordinary portability checks make no external calls');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, scenarios: 4, dashboardStatements: executions, statementMetrics: metrics, externalRequests,
    limits: 'Native SQLite C prepare: expression100/function32/SQL100KB/bind100; explicit byte/bind/literal-pattern50 checks before production D1 mapping over SQLite. Seed/migration statements and full Worker/browser execution are outside this check.' }));
} catch (error) {
  // Drizzle errors can contain SQL and bind values. Never render their message,
  // stack, causes or query. Only this test's bounded static labels are emitted.
  console.error(JSON.stringify({ passed, failed: 1, skipped: 0, failureClass: error.name,
    detail: error instanceof PortabilityFailure ? error.message : 'Ordinary portability contract failed; underlying query details withheld.' }));
  process.exitCode = 1;
} finally { fixture?.sqlite.close(); globalThis.fetch = originalFetch; }
