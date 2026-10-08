// NFR-09 change control for the database (designed cases TC-020 .. recovery/restore preconditions; docs/RELEASE-CHECKLIST.md).
// Original and already-applied migrations are preserved byte for byte, new migrations are additive, ordered, uniquely
// timestamped and single-statement per breakpoint piece (the hosted runner failed on multi-statement files), the whole
// chain replays on an empty database, and an upgrade from the last original migration keeps every earlier object.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { root } from '../support/security-db.mjs';

let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks++;
};
const equal = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const dir = join(root, 'drizzle');
const BREAK = '--> statement-breakpoint';

// SHA-256 of every original migration (0000-0016), recorded from main before this work. Applied history must never be
// edited: a changed hash means a previously applied migration was rewritten, which is a release-blocking change.
const ORIGINAL = {
  '0000_youthful_jamie_braddock.sql': '4beaa69783f4516562d0d3c453486470374191c5577f2768bc5f6511f13dd285',
  '0001_trusted_identity.sql': 'a7bf8b2b5a9e74b87fdf3097e566f5e190b10c52dd3f8d06fe2ed99d0e208786',
  '0002_reviewed_reading.sql': '2f8a0ffb44e4a86e6d01d06a6b172206a9a537970d359aff93fab60616e436d3',
  '0003_teacher_resources.sql': '89e7bc48b1f724f9d742e7e3580c286b8700594e5cdebcae3cb440e7b77c6a10',
  '0004_identity_admin.sql': '3f4f8521d980aa141e44a34e335098ede54529cdc8be170336be5e9d0a28405c',
  '0005_curriculum.sql': 'd764ca2ba046c61dce413861c68b8a57318552fbe89dbd5dbcdbf27bdf96d3c1',
  '0006_submissions.sql': '8e9e67dfa2fc4973309d1ca6f2c90e5d03311c32d95fe94d5ce3ea37926ffb60',
  '0007_reading_corrections.sql': 'f9a6775eaffdbf941f8551fa83d3e5b41f1b26bd04026703d513ea718ee15960',
  '0008_profile_links.sql': '3c867f8bbf091b05354eaf8ad1b25dbf9d0dfc869642e28f7d107ca5ea078de4',
  '0009_academic_integrity.sql': 'f6c1c3c904134f84bfa48e9a278b97d84e16b6e2fd79dbe840360ba1449ad0b7',
  '0010_reading_imports.sql': '98bf72804423a2009481873884d718590161622c5b854d0001fc10f7d91ba03e',
  '0011_submission_windows.sql': 'f05c631a40a30781037d44f425f5ea9dc69b81764d72402c9311802db801f4cc',
  '0012_report_publication_receipts.sql': 'e938cb135f07ea4d31cc945340c97a1890f3f66af38ec1466fc1d9e8e9d87612',
  '0013_attendance_reviews.sql': '7f5241208d10ccfbceca3f85796180045e5848a0dac508ef5f1f13b13acda197',
  '0014_assessment_reviews.sql': '72b53a26523596c64090a5f27f2faf32feaf8f39601db4737715dd45034ed48b',
  '0015_registry_creation.sql': '01ea4fceea2679a8c937286540dc6b087b5ac3f47485d16db8a098980f541db8',
  '0016_synthetic_demo.sql': '46ad233971eb95880e3f7331749ba520726dcdd1905ca89ccabea5bf9edda38a',
};
const files = readdirSync(dir)
  .filter((name) => /\.sql$/.test(name))
  .sort();
check(
  files.every((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)),
  'every migration file is named NNNN_snake_case.sql',
);
const numbers = files.map((name) => Number(name.slice(0, 4)));
equal(
  new Set(numbers).size,
  numbers.length,
  'migration numbers are unique (no two agents or branches share a number)',
);
equal(
  numbers.slice(0, 17),
  Array.from({ length: 17 }, (_, index) => index),
  'original migrations 0000-0016 are present and contiguous',
);
for (const [name, expected] of Object.entries(ORIGINAL))
  equal(
    sha256(readFileSync(join(dir, name))),
    expected,
    `original migration ${name} is byte-identical to the applied history`,
  );
equal(files.slice(0, 17), Object.keys(ORIGINAL), 'no original migration was renamed, removed or replaced');

// Journal.
const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf8'));
const entries = journal.entries;
check(
  entries.every((entry) => entry.version === '6' && entry.breakpoints === true),
  'every journal entry is version 6 with statement breakpoints',
);
equal(new Set(entries.map((entry) => entry.idx)).size, entries.length, 'journal idx values are unique');
equal(
  new Set(entries.map((entry) => entry.when)).size,
  entries.length,
  'journal `when` timestamps are unique',
);
equal(new Set(entries.map((entry) => entry.tag)).size, entries.length, 'journal tags are unique');
for (const entry of entries) {
  check(files.includes(`${entry.tag}.sql`), `journal entry ${entry.tag} has its migration file`);
  equal(Number(entry.tag.slice(0, 4)), entry.idx, `journal idx of ${entry.tag} equals its file number`);
}
for (const name of files)
  check(
    entries.some((entry) => `${entry.tag}.sql` === name),
    `migration ${name} is registered in the journal`,
  );
const ordered = [...entries].sort((a, b) => a.idx - b.idx);
// Historical journal entries 0001 > 0002/0003 are not monotonic (recorded risk, never rewritten). Every NEW entry must be
// later than every earlier entry so a drizzle migrator that skips timestamps at or below the last applied one cannot skip it.
const newEntries = ordered.filter((entry) => entry.idx > 16);
const originalMax = Math.max(...ordered.filter((entry) => entry.idx <= 16).map((entry) => entry.when));
newEntries.forEach((entry, index) => {
  check(entry.when > originalMax, `journal: ${entry.tag} is later than every original entry`);
  if (index > 0)
    check(
      entry.when > newEntries[index - 1].when,
      `journal: ${entry.tag} is later than ${newEntries[index - 1].tag}`,
    );
});
// The original 17 journal entries (including their timestamps) are pinned by their serialized form.
const PINNED_JOURNAL_ENTRIES = 17;
equal(
  sha256(JSON.stringify(ordered.slice(0, PINNED_JOURNAL_ENTRIES))),
  '4b3ee91c77c1bbd7657b0a56d9ec1d3d434ab7aa9dc606a468f01760dc11f377',
  'original journal entries 0-16 (tags and timestamps) are unchanged',
);
equal(
  ordered.slice(0, PINNED_JOURNAL_ENTRIES).map((entry) => `${entry.idx}:${entry.tag}`),
  Object.keys(ORIGINAL).map((name) => `${Number(name.slice(0, 4))}:${name.replace(/\.sql$/, '')}`),
  'the original journal entries map one-to-one to the original files',
);

// New migrations (> 0016) are additive and single-statement per breakpoint piece.
const FORBIDDEN = [
  /\bDROP\s+(TABLE|COLUMN|INDEX|TRIGGER|VIEW)\b/i,
  /\bRENAME\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bPRAGMA\b/i,
  /\bATTACH\b/i,
  /\bVACUUM\b/i,
];
const strip = (sql) =>
  sql
    .replace(/--[^\n]*/g, '')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/`[^`]*`/g, '``')
    .trim();
let pieces = 0,
  triggerPieces = 0;
for (const name of files.filter((file) => Number(file.slice(0, 4)) > 16)) {
  const text = readFileSync(join(dir, name), 'utf8');
  check(!/\r/.test(text), `${name}: LF line endings`);
  const parts = text
    .split(BREAK)
    .map((part) => part.trim())
    .filter(Boolean);
  check(parts.length >= 1, `${name}: has statements`);
  for (const [index, part] of parts.entries()) {
    const code = strip(part);
    const label = `${name} piece ${index + 1}`;
    pieces++;
    for (const pattern of FORBIDDEN)
      check(!pattern.test(code), `${label}: additive migrations never use ${pattern}`);
    if (/^CREATE\s+(TEMP\s+)?TRIGGER\b/i.test(code)) {
      triggerPieces++;
      check(
        (code.match(/\bCREATE\s+TRIGGER\b/gi) ?? []).length === 1,
        `${label}: exactly one trigger per piece`,
      );
      check(/\bEND\s*;$/i.test(code), `${label}: trigger ends with END;`);
      // A trigger body may hold CASE ... END expressions; every END beyond one per CASE belongs to the trigger itself, so exactly one remains.
      check(
        (code.match(/\bEND\b/gi) ?? []).length === (code.match(/\bCASE\b/gi) ?? []).length + 1,
        `${label}: one closing END (no second statement after the trigger)`,
      );
    } else {
      const body = code.replace(/;$/, '');
      check(!body.includes(';'), `${label}: exactly one statement (no semicolon inside the piece)`);
      check(
        /^(CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\b|ALTER\s+TABLE\s+\S+\s+ADD\s+(COLUMN\s+)?\S+|INSERT\s+(OR\s+IGNORE\s+)?INTO\b)/i.test(
          code,
        ),
        `${label}: only CREATE TABLE/INDEX, ALTER TABLE ADD COLUMN or seed INSERT (got ${code.slice(0, 40)})`,
      );
    }
  }
}
console.log(
  `New migrations: ${files.filter((file) => Number(file.slice(0, 4)) > 16).join(', ') || 'none'} (${pieces} pieces, ${triggerPieces} triggers).`,
);

// Replays.
function apply(database, names) {
  for (const name of names) database.exec(readFileSync(join(dir, name), 'utf8').replaceAll(BREAK, ''));
}
const objects = (database) =>
  database
    .prepare(
      "SELECT type, name, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
    .all()
    .map((row) => ({ ...row }));
const columns = (database) =>
  Object.fromEntries(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((table) => [
        table.name,
        database
          .prepare(`PRAGMA table_info("${table.name}")`)
          .all()
          .map((column) => `${column.name}:${column.type}:${column.notnull}`),
      ]),
  );
const full = new DatabaseSync(':memory:');
full.exec('PRAGMA foreign_keys=ON');
apply(full, files);
equal(
  full.prepare('PRAGMA integrity_check').get().integrity_check,
  'ok',
  'the full chain replays on an empty database and passes integrity_check',
);
equal(full.prepare('PRAGMA foreign_key_check').all().length, 0, 'the full chain has no dangling foreign key');
const original = new DatabaseSync(':memory:');
original.exec('PRAGMA foreign_keys=ON');
apply(original, files.slice(0, 17));
const upgraded = new DatabaseSync(':memory:');
upgraded.exec('PRAGMA foreign_keys=ON');
apply(upgraded, files.slice(0, 17));
apply(upgraded, files.slice(17));
equal(objects(upgraded), objects(full), 'upgrading from 0016 yields exactly the schema of a fresh install');
const before = objects(original),
  after = objects(upgraded);
for (const object of before)
  check(
    after.some((candidate) => candidate.type === object.type && candidate.name === object.name),
    `upgrade keeps ${object.type} ${object.name}`,
  );
const originalColumns = columns(original),
  upgradedColumns = columns(upgraded);
for (const [table, list] of Object.entries(originalColumns))
  equal(
    upgradedColumns[table].slice(0, list.length),
    list,
    `${table}: original columns keep name, type, nullability and order (additive only)`,
  );
// The hosted runner executes ONE statement per breakpoint piece. Replay the whole chain on an empty database in journal order,
// each piece prepared and run on its own. SQLite's prepare() compiles only the first statement of a string and silently drops
// the rest, so a piece that hid a second statement would leave a different schema or different seed rows than the whole-file
// replay. Recorded limitation: six ORIGINAL migrations (0005, 0010, 0012-0015) are single pieces holding several statements and
// can never be edited (applied history), so they are replayed whole, exactly as they were first applied; every new migration
// (0017 onward) must replay piece by piece.
const ORIGINAL_MULTI_STATEMENT = [
  '0005_curriculum',
  '0010_reading_imports',
  '0012_report_publication_receipts',
  '0013_attendance_reviews',
  '0014_assessment_reviews',
  '0015_registry_creation',
];
{
  const rowCounts = (database) =>
    Object.fromEntries(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map((table) => [table.name, database.prepare(`SELECT count(*) AS n FROM "${table.name}"`).get().n]),
    );
  const byPiece = new DatabaseSync(':memory:');
  byPiece.exec('PRAGMA foreign_keys=ON');
  let executed = 0,
    wholeFile = 0;
  const multiStatementOriginals = [];
  for (const entry of ordered) {
    const parts = readFileSync(join(dir, `${entry.tag}.sql`), 'utf8')
      .split(BREAK)
      .map((part) => part.trim())
      .filter(Boolean);
    if (entry.idx <= 16) {
      // Originals: detect (not hide) the multi-statement pieces, then replay the file as first applied.
      if (
        parts.some((part) => {
          const code = strip(part);
          return !/^CREATE\s+(TEMP\s+)?TRIGGER\b/i.test(code) && code.replace(/;$/, '').includes(';');
        })
      )
        multiStatementOriginals.push(entry.tag);
      byPiece.exec(parts.join('\n'));
      wholeFile++;
      continue;
    }
    for (const [index, part] of parts.entries()) {
      try {
        byPiece.prepare(part).run();
      } catch (error) {
        check(false, `${entry.tag} piece ${index + 1} failed on the empty-database replay: ${error.message}`);
      }
      executed++;
    }
  }
  equal(
    multiStatementOriginals,
    ORIGINAL_MULTI_STATEMENT,
    'exactly the six known original migrations hold multi-statement pieces; none of the new ones does',
  );
  equal(wholeFile, 17, 'the 17 original migrations were replayed whole, as first applied');
  equal(executed, 127, 'every one of the 127 pieces of the new migrations ran on its own, in journal order');
  equal(
    ordered.map((entry) => entry.tag),
    files.map((name) => name.replace(/\.sql$/, '')),
    'journal order equals file order (every migration applied once, in sequence)',
  );
  equal(
    byPiece.prepare('PRAGMA integrity_check').get().integrity_check,
    'ok',
    'the piece-by-piece replay passes integrity_check',
  );
  equal(
    byPiece.prepare('PRAGMA foreign_key_check').all().length,
    0,
    'the piece-by-piece replay has no dangling foreign key',
  );
  equal(
    objects(byPiece),
    objects(full),
    'one-statement-per-piece replay yields exactly the schema of the whole-file replay (no piece hid a second statement)',
  );
  equal(columns(byPiece), columns(full), 'one-statement-per-piece replay yields exactly the same columns');
  equal(rowCounts(byPiece), rowCounts(full), 'one-statement-per-piece replay seeds exactly the same rows');
  equal(
    byPiece.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger'").get().n,
    full.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger'").get().n,
    'trigger count matches the whole-file replay',
  );
}
// 0025 adds guards for older evidence tables but deliberately does NOT re-create the six guards 0021 already creates (a second
// CREATE TRIGGER with the same name would fail the chain). Each of the six must therefore be defined exactly once, in 0021.
{
  const sixGuards = [
    'submission_attempts_no_update',
    'submission_attempts_no_delete',
    'submission_feedback_no_update',
    'submission_feedback_no_delete',
    'identity_admin_events_no_update',
    'identity_admin_events_no_delete',
  ];
  const text = (name) =>
    readFileSync(
      join(
        dir,
        files.find((file) => file.startsWith(name)),
      ),
      'utf8',
    );
  for (const guard of sixGuards) {
    equal(
      [...files].filter((file) =>
        new RegExp(`CREATE TRIGGER ${guard}\\b`).test(readFileSync(join(dir, file), 'utf8')),
      ),
      files.filter((file) => file.startsWith('0021')),
      `${guard} is created by 0021 and by no other migration (0025 does not duplicate it)`,
    );
    check(!text('0025').includes(guard), `0025 does not re-create ${guard}`);
  }
  equal(
    full
      .prepare(
        "SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name IN (" +
          sixGuards.map(() => '?').join(',') +
          ')',
      )
      .get(...sixGuards).n,
    6,
    'all six guards exist on the fully migrated database',
  );
}
console.log(
  `Schema: ${full.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n} tables, ${full.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger'").get().n} triggers after ${files.length} migrations.`,
);

// Release documents exist and carry the rules (TC change-control cases).
if (existsSync(join(root, 'docs/RELEASE-CHECKLIST.md'))) {
  const checklist = readFileSync(join(root, 'docs/RELEASE-CHECKLIST.md'), 'utf8');
  for (const phrase of [
    'statement-breakpoint',
    'when',
    'last applied',
    'never edit',
    'rollback',
    'forward-only',
    'node scripts/test.mjs',
    'check-documentation.py',
    'audit-requirements.mjs',
    'check-specification.mjs',
  ])
    check(checklist.toLowerCase().includes(phrase.toLowerCase()), `release checklist states "${phrase}"`);
}
console.log(`Migration governance: ${checks} checks passed.`);
console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
