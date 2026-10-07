import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './security-db.mjs';

// Records every statement a suite really executes and later compiles each one with the
// Cloudflare D1 limits that matter for these queries: 100 bound variables and expression
// depth 100. A statement that exceeds either limit fails here instead of only on the host.
export function recordStatements(sqlite) {
  const statements = new Map(); const original = sqlite.prepare.bind(sqlite);
  sqlite.prepare = query => {
    const statement = original(query); let variables = 0;
    for (const method of ['run', 'get', 'all']) { const real = statement[method].bind(statement); statement[method] = (...parameters) => { variables = Math.max(variables, parameters.length); statements.set(query, Math.max(statements.get(query) ?? 0, variables)); return real(...parameters); }; }
    return statement;
  };
  return statements;
}
const compiler = `
import json, sqlite3, sys
data = json.load(sys.stdin)
connection = sqlite3.connect(':memory:')
connection.executescript(data['schema'])
connection.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, 100)
connection.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, 100)
failures = []
for statement in data['statements']:
    if not statement['sql'].lstrip().lower().startswith(('select', 'insert', 'update', 'delete', 'with')): continue
    try:
        connection.execute('EXPLAIN ' + statement['sql'], [None] * statement['variables'])
    except sqlite3.Error as error:
        failures.append(str(error)[:160] + ' :: ' + statement['sql'][:100].replace(chr(10), ' '))
print(json.dumps({'checked': len(data['statements']), 'failures': failures}))
`;
export function compileWithD1Limits(statements) {
  const migrations = readdirSync(join(root, 'drizzle')).filter(name => /^\d.*\.sql$/.test(name)).sort();
  const schema = migrations.map(name => readFileSync(join(root, 'drizzle', name), 'utf8').replaceAll('--> statement-breakpoint', '')).join('\n');
  const input = JSON.stringify({ schema, statements: [...statements].map(([sql, variables]) => ({ sql, variables })) });
  const run = spawnSync('python3', ['-I', '-c', compiler], { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error('D1 limit compile failed: ' + run.stderr.slice(0, 400));
  return JSON.parse(run.stdout);
}
