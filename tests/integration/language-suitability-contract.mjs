// NFR-06 language suitability: static contract over every user-facing string in app/ and components/.
// Scope: the strings found by the TypeScript-AST extractor (tests/support/ui-strings.mjs): JSX text, string
// literals in JSX attributes and in message/error setters. This is a wording-pattern check and a reading-level
// measurement. It is NOT a review by a named language reviewer, and it does not judge tone, translation or
// whether a message is useful. Reading grade uses Flesch-Kincaid, which is a rough guide only.
//
// Ratchet: every forbidden-pattern hit that remains is listed in KNOWN with a maximum count per (file, rule) and a
// reason. A new hit, or a count above the cap, fails. A cap above the real count also fails, so the list
// can only shrink. Set SAHA_LANGUAGE_REPORT=1 to print the current table without asserting.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { allStrings, readingGrade } from '../support/ui-strings.mjs';

// SAHA_LANGUAGE_ROOT points the report mode at another checkout (for example an older tree, to measure before and after).
const root = process.env.SAHA_LANGUAGE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const RULES = {
  uuid: [/\bUUIDs?\b/, 'UUID'],
  json: [/\bJSON\b/, 'JSON'],
  payload: [/\bpayloads?\b/i, 'payload'],
  idempotent: [/idempoten/i, 'idempotent'],
  cas: [/\bCAS\b/, 'CAS'],
  snapshot: [/\bsnapshots?\b/i, 'snapshot'],
  immutable: [/\bimmutable\b/i, 'immutable'],
  normalized: [/\bnormali[sz]ed\b/i, 'normalized'],
  envelope: [/\benvelope\b/i, 'envelope'],
  issuer: [/\bissuer\b|identity subject|provider subject/i, 'issuer / identity subject'],
  token: [/\btokens?\b/i, 'token'],
  staging: [/\bstag(ed|ing)\b/i, 'staged / staging'],
  nullish: [/\b(null|undefined|NaN)\b/, 'null / undefined / NaN'],
  protocol: [/\b(HTTPS?|API|SQL|D1|OIDC|CSRF)\b/, 'HTTP / API / SQL / D1 / OIDC / CSRF'],
  camelCase: [/\b[a-z]+[A-Z][a-zA-Z]+\b/, 'code identifier'],
  versionId: [/\bsaha\.[a-z-]+\.v\d+\b/, 'dotted format id'],
  rawIdLabel: [/\b(Student|Teacher|Course|Class|Profile|Account|Decision|Observation|Import|Staff|Linked account|learner|class) IDs?\b|\bIDs\b/, 'raw ID label'],
  learner: [/\blearners?\b/i, 'learner (the product says student)'],
  usEnroll: [/\benroll(ment|ments)?\b/i, 'US spelling of enrol'],
};

// Components copied from a UI kit and never shown with their own words.
const SKIPPED = /^components\/(carousel|chart|form|sidebar|spinner|table|pagination|breadcrumb|dialog|sheet|message-scroller)/;

// file -> rule -> [maximum count, reason]. Reasons are specific; "pinned" means an existing contract or mounted
// test asserts the exact wording, so changing it is a spec-level decision for that test's owner.
const KNOWN = {
  'app/admin/profile-links/page.tsx': { rawIdLabel: [3, 'administrator-only exact identifiers (Profile, Linked account and Decision) that an auditor must quote; no plain name exists for them'] },
  'app/admin/users/page.tsx': { issuer: [5, 'administrator-only identity-provider fields; the exact issuer and subject are the data being entered'] },
  'app/assessments/[id]/page.tsx': { learner: [2, 'pinned: assessment-detail-ui-contract asserts "No active learners are available" and "Multiple saved results exist for a learner"'] },
  'app/assignments/[id]/page.tsx': { uuid: [1, 'pinned: worker-specification-ui-check asserts "exact original request and UUID are retained"'] },
  'app/attendance/page.tsx': { learner: [4, 'pinned: worker-attendance-summary-ui-check and the attendance contracts assert these learner sentences'] },
  'app/classes/[id]/attendance/page.tsx': { learner: [2, 'pinned: the attendance editor contract asserts "Unrecorded learners remain blank" and "No active learners are available for this class"'] },
  'app/classes/[id]/page.tsx': { rawIdLabel: [2, 'finding: the page prints the stored Course ID and Teacher ID because it does not load their names; owned by the class workstream, listed in the record'] },
  'app/curriculum/[id]/page.tsx': { protocol: [3, 'HTTPS is the rule the author must follow when adding a source link; label pinned by the curriculum tests'] },
  'app/curriculum/page.tsx': { protocol: [2, 'HTTPS is the rule the author must follow when adding a source link; label pinned by the curriculum tests'] },
  'app/reading-imports/page.tsx': {
    camelCase: [3, 'import file field names shown so school IT staff can build the file; owned by the reading workstream, listed in the record'],
    envelope: [5, 'import file format heading; same owner and reason'],
    json: [7, 'import file format; the page is for local result files in JSON'],
    learner: [5, 'learner wording on the import page; owned by the reading workstream, listed in the record'],
    normalized: [3, 'import file format; same reason'],
    rawIdLabel: [6, 'the import file names students by their exact ID, so the page shows it; listed in the record'],
    staging: [2, 'preview wording on the import page; listed in the record'],
    usEnroll: [1, 'US spelling "enrollment" on the import page; listed in the record'],
    versionId: [1, 'the exact import format identifier users must type'],
  },
  'app/reading-practice/page.tsx': { learner: [3, 'pinned or owned by the reading workstream; listed in the record'] },
  'app/reading-review/page.tsx': { learner: [2, 'pinned or owned by the reading workstream; listed in the record'], rawIdLabel: [3, 'Observation ID is pinned by worker-specification-ui-check'] },
  'app/report-cards/[id]/page.tsx': { rawIdLabel: [1, 'finding: the report card prints the stored Student ID instead of a name; owned by the reports workstream, listed in the record'] },
  'components/assignment-submission-window.tsx': { rawIdLabel: [1, 'finding: shows the reviewing staff member by stored Staff ID; window revision wording is pinned'] },
};

export function findHits(strings = allStrings(root)) {
  const hits = [];
  for (const entry of strings) {
    if (SKIPPED.test(entry.file)) continue;
    for (const [rule, [pattern]] of Object.entries(RULES)) if (pattern.test(entry.text)) hits.push({ file: entry.file, line: entry.line, rule, text: entry.text });
  }
  return hits;
}

export function tally(hits) {
  const counts = new Map();
  for (const hit of hits) { const key = `${hit.file}\u0000${hit.rule}`; counts.set(key, (counts.get(key) ?? 0) + 1); }
  return counts;
}

export function grades(strings) {
  const family = file => /^(app\/(login|notifications|report-cards|learning|dashboard\/(guardian|student)))\b/.test(file) || file === 'components/role-guide.tsx';
  const guide = strings.filter(entry => entry.file === 'components/role-guide.tsx').map(entry => entry.text);
  const familyTexts = strings.filter(entry => family(entry.file) && entry.text.split(/\s+/).length >= 4).map(entry => entry.text);
  const all = strings.filter(entry => !SKIPPED.test(entry.file) && entry.text.split(/\s+/).length >= 4).map(entry => entry.text);
  return { all: readingGrade(all), family: readingGrade(familyTexts), guide: readingGrade(guide), counts: { all: all.length, family: familyTexts.length, guide: guide.length } };
}

if (process.env.SAHA_LANGUAGE_REPORT) {
  const strings = allStrings(root);
  const hits = findHits(strings);
  const counts = tally(hits);
  for (const [key, count] of [...counts].sort()) { const [file, rule] = key.split('\u0000'); console.log(`${file}\t${rule}\t${count}`); }
  console.log(JSON.stringify({ strings: strings.length, hits: hits.length, grades: grades(strings) }));
  process.exit(0);
}

let passed = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
const okay = (value, message) => { assert.ok(value, message); passed++; };

const strings = allStrings(root);
okay(strings.length > 1000, `The extractor finds the interface wording (${strings.length} strings)`);
for (const file of ['components/role-guide.tsx', 'app/login/page.tsx', 'components/app-shell.tsx', 'app/dashboard/guardian/page.tsx']) okay(strings.some(entry => entry.file === file), `The extractor reads ${file}`);

// 1. Each rule matches what it is meant to match and leaves ordinary words alone (guards against a rule that silently matches nothing).
const samples = {
  uuid: ['The saved UUID is kept', 'Your original request is kept'], json: ['Paste the JSON here', 'Jason wrote this'], payload: ['The same payload was sent', 'Pay the load'],
  idempotent: ['This is idempotent', 'This is the same'], cas: ['CAS failed', 'Casual note'], snapshot: ['Loaded snapshot', 'Page loaded at'], immutable: ['immutable receipt', 'Saved copy'],
  normalized: ['normalized rows', 'Normal rows'], envelope: ['Normalized envelope', 'Write a letter'], issuer: ['Identity issuer', 'Identity provider name'], token: ['No tokens here', 'Tokyo'],
  staging: ['Staged preview', 'Stage one of two'], nullish: ['value is undefined', 'Nullify the plan'], protocol: ['Use HTTPS only', 'Use secure links'], camelCase: ['the studentId field', 'Student name'],
  versionId: ['Format saha.reading-results.v1', 'Format for results'], rawIdLabel: ['Student ID: 4', 'Student name: Asha'], learner: ['Each learner', 'Each student'], usEnroll: ['Enrollment is open', 'Enrolment is open'],
};
for (const [rule, [bad, good]] of Object.entries(samples)) { check(RULES[rule][0].test(bad), true, `Rule ${rule} flags "${bad}"`); check(RULES[rule][0].test(good), false, `Rule ${rule} allows "${good}"`); }
check(Object.keys(samples).sort(), Object.keys(RULES).sort(), 'Every rule has a sample');

// 2. Ratchet against the list of known remaining hits.
const hits = findHits(strings);
const counts = tally(hits);
const known = new Map();
for (const [file, rules] of Object.entries(KNOWN)) for (const [rule, [max, reason]] of Object.entries(rules)) {
  okay(RULES[rule], `Known entry ${file}/${rule} uses a real rule`);
  okay(typeof reason === 'string' && reason.length >= 12, `Known entry ${file}/${rule} has a reason`);
  known.set(`${file}\u0000${rule}`, max);
}
const over = [], slack = [];
for (const [key, count] of counts) { const max = known.get(key) ?? 0; if (count > max) over.push({ key: key.replace('\u0000', ' / '), count, max, examples: hits.filter(hit => `${hit.file}\u0000${hit.rule}` === key).slice(0, 3).map(hit => `${hit.line}: ${hit.text.slice(0, 90)}`) }); }
for (const [key, max] of known) if ((counts.get(key) ?? 0) < max) slack.push({ key: key.replace('\u0000', ' / '), count: counts.get(key) ?? 0, max });
check(over, [], 'No new or additional forbidden wording (fix the wording, or add a reasoned entry to KNOWN)');
check(slack, [], 'The known list is tight: lower or remove entries whose wording has been fixed');

// 3. Reading level of the strings families and first-time visitors read first.
const measured = grades(strings);
okay(measured.guide > 0 && measured.guide <= 8, `Guide and demo wording reads at about grade 8 or below (grade ${measured.guide.toFixed(1)})`);
okay(measured.family > 0 && measured.family <= 8, `Family-facing pages read at about grade 8 or below (grade ${measured.family.toFixed(1)})`);
okay(measured.all > 0 && measured.all <= 9, `Overall wording reads at about grade 9 or below (grade ${measured.all.toFixed(1)})`);

console.log(JSON.stringify({ passed, failed: 0, skipped: 0, strings: strings.length, hits: hits.length, knownEntries: known.size, grades: { guide: +measured.guide.toFixed(2), family: +measured.family.toFixed(2), all: +measured.all.toFixed(2) }, stringCounts: measured.counts,
  scope: 'Static wording-pattern and reading-grade check over app/ and components/ strings; not a named language-reviewer judgement, translation review or tone review' }));
