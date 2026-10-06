// Read-only diagnostic for the hosted migration failure (docs/current/HOSTED-DEPLOYMENT-FAILURE.md).
// It never edits a migration. It replays the committed drizzle/*.sql files into a throwaway in-memory SQLite database
// with several plausible statement-splitting strategies and reports where each one first meets "incomplete input".
// This identifies candidate boundaries only: the hosted runner and its first failed file are not known from this repository.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const dir = new URL('../drizzle/', import.meta.url);
const files = readdirSync(dir).filter(name => name.endsWith('.sql')).sort();
const BREAK = '--> statement-breakpoint';
const strategies = {
  'drizzle breakpoint pieces (whole piece executed)': sql => sql.split(BREAK),
  'one physical line per statement': sql => sql.split('\n'),
  'split at every semicolon': sql => sql.split(';'),
  'split at semicolon followed by newline': sql => sql.split(/;\s*\n/).map(part => part + ';'),
};

const report = { strategies: {}, pieceFacts: {} };
for (const [name, split] of Object.entries(strategies)) {
  const db = new DatabaseSync(':memory:');
  let applied = 0; const failures = [];
  for (const file of files) {
    for (const [index, piece] of split(readFileSync(new URL(file, dir), 'utf8')).entries()) {
      if (!piece.trim()) continue;
      try { db.exec(piece); applied++; } catch (error) { failures.push({ file, piece: index, error: String(error.message) }); }
    }
  }
  db.close();
  const first = failures[0] ?? null;
  report.strategies[name] = { applied, failures: failures.length, firstFailure: first, firstIncompleteInput: failures.find(x => /incomplete input/.test(x.error)) ?? null, filesWithFailures: [...new Set(failures.map(x => x.file))].length };
}

const empty = [], multi = [];
let triggerPieces = 0, pieces = 0;
for (const file of files) {
  readFileSync(new URL(file, dir), 'utf8').split(BREAK).forEach((piece, index) => {
    const body = piece.replace(/--[^\n]*/g, '').trim();
    if (!body) { empty.push(`${file}#${index}`); return; }
    pieces++; if (/CREATE\s+TRIGGER/i.test(body)) triggerPieces++;
    const count = body.replace(/CREATE\s+TRIGGER[\s\S]*?\bEND\s*;?/gi, 'T;').split(';').map(x => x.trim()).filter(Boolean).length;
    if (count > 1) multi.push({ piece: `${file}#${index}`, statements: count });
  });
}
report.pieceFacts = { sqlFiles: files.length, nonEmptyBreakpointPieces: pieces, piecesContainingTriggers: triggerPieces, emptyOrCommentOnlyPieces: empty, multiStatementPieces: multi };
console.log(JSON.stringify(report, null, 2));
