#!/usr/bin/env node
// Synthetic demonstration school for Saha Education. Every name, record and message here is invented.
//
// The seed is plain SQL for a database that already has every migration applied, so it exercises the same
// constraints and triggers as a real installation (for example the report publication receipt creates the
// family notice). It is deterministic for a given --anchor date and installation id, and it only inserts, so
// it is meant for a fresh database; a second run fails on the fixed school id instead of adding a second school.
//
//   node scripts/seed-demo.mjs --out demo.sql [--with-schema] [--anchor 2026-10-06] [--installation <uuid4>]
//        [--sessions sessions.json] [--manifest manifest.json]
//
// --with-schema puts every drizzle migration in front of the seed, so one file can initialise an empty D1.
// --sessions adds one signed-in session per role and writes the private cookie values for browser tests.
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEMO_SCHOOL_ID = 'saha-demo-school';
export const DEMO_ISSUER = 'https://saha-demo.example.invalid';
export const DEMO_INSTALLATION_ID = '5a4a0e26-6d0c-4a3e-9c1d-0e2600000a10';
export const DEMO_SCHOOL_NAME = 'River School — synthetic demo';
export const SESSION_COOKIE = '__Host-saha_session';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;

// ---------- small deterministic helpers ----------
function hash32(text) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(label) {
  let a = hash32(label);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const iso = (ms) => new Date(ms).toISOString();
const day = (ms) => iso(ms).slice(0, 10);
const utc = (text) => Date.parse(text + 'T00:00:00.000Z');
const weekday = (ms) => new Date(ms).getUTCDay(); // 0 Sunday
const pad = (n, w = 2) => String(n).padStart(w, '0');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Seed numbers must be finite');
    return String(value);
  }
  return "'" + String(value).replaceAll("'", "''") + "'";
}

// ---------- people ----------
const FIRST = [
  'Maya',
  'Karthik',
  'Noor',
  'Ishaan',
  'Diya',
  'Kabir',
  'Anaya',
  'Vihaan',
  'Meera',
  'Zoya',
  'Reyansh',
  'Tara',
  'Aarav',
  'Ira',
  'Dev',
  'Saanvi',
  'Nikhil',
  'Fatima',
  'Rahul',
  'Leela',
  'Arun',
  'Pooja',
  'Imran',
  'Sneha',
  'Tanvi',
  'Yash',
  'Riya',
  'Omar',
  'Kiran',
  'Lakshmi',
  'Farhan',
  'Gauri',
  'Sameer',
  'Nisha',
  'Rohit',
  'Aditi',
  'Jasleen',
  'Manav',
  'Bhavna',
  'Zubin',
];
const SURNAME = [
  'Nair',
  'Sharma',
  'Khan',
  'Patel',
  'Das',
  'Reddy',
  'Singh',
  'Thomas',
  'Gupta',
  'Menon',
  'Joshi',
  'Kulkarni',
  'Bose',
  'Ansari',
  'Mehta',
  'Rao',
  'Chopra',
  'Pillai',
  'Sethi',
  'Banerjee',
];
const ADULT = [
  'Sunita',
  'Rajesh',
  'Neha',
  'Imtiaz',
  'Padma',
  'Suresh',
  'Anita',
  'Vikram',
  'Shabana',
  'Mohan',
  'Deepti',
  'Arvind',
  'Kavita',
  'Salim',
  'Rekha',
  'Prakash',
  'Mala',
  'Naveen',
  'Seema',
  'Ramesh',
  'Alka',
  'Faisal',
  'Usha',
  'Dinesh',
  'Hema',
  'Gopal',
  'Jyoti',
  'Tariq',
  'Sarita',
  'Harish',
  'Nalini',
  'Anwar',
  'Preeti',
  'Sandeep',
  'Roshni',
  'Vinod',
  'Lata',
  'Ajay',
  'Zeenat',
  'Kamal',
];
const RELATION = [
  'mother',
  'father',
  'mother',
  'father',
  'grandmother',
  'mother',
  'uncle',
  'father',
  'mother',
  'aunt',
];
const SIBLINGS = [
  [1, 21],
  [5, 25],
  [9, 29],
]; // learner numbers that share one guardian profile; the first pair is the demo family
const LEARNERS = 40;
const withdrawnLearner = 17; // leaves Science 5A part-way through the term
const lowAttendance = new Map([
  [14, 0.62],
  [33, 0.78],
]);

function buildPeople() {
  const learners = [];
  for (let i = 1; i <= LEARNERS; i++) {
    const sibling = SIBLINGS.find((pair) => pair.includes(i));
    const surname = sibling
      ? i === 1 || i === 21
        ? 'Iyer'
        : SURNAME[(sibling[0] * 3) % SURNAME.length]
      : SURNAME[(i * 7 + 3) % SURNAME.length];
    const r = rng('learner-' + i);
    const ability = i === 1 ? 0.84 : clamp(0.42 + r() * 0.5, 0.4, 0.95);
    learners.push({
      n: i,
      id: 'saha-demo-learner-' + pad(i),
      first: FIRST[i - 1],
      last: surname,
      section: i <= 20 ? 'a' : 'b',
      ability,
      birth: `${2015 + (i % 2)}-${pad(1 + ((i * 5) % 12))}-${pad(1 + ((i * 11) % 27))}`,
      admission: 'RS-2026-' + pad(i, 3),
    });
  }
  const guardians = [],
    link = [];
  for (const l of learners) {
    const sibling = SIBLINGS.find((pair) => pair.includes(l.n));
    if (sibling && l.n !== sibling[0]) {
      link.push([l.id, 'saha-demo-guardian-' + pad(sibling[0])]);
      continue;
    }
    const g = {
      n: l.n,
      id: 'saha-demo-guardian-' + pad(l.n),
      name: ADULT[l.n - 1] + ' ' + l.last,
      relationship: RELATION[l.n % RELATION.length],
    };
    guardians.push(g);
    link.push([l.id, g.id]);
  }
  return { learners, guardians, link };
}

// ---------- timeline ----------
function buildCalendar(anchorText) {
  const anchor = utc(anchorText);
  let end = anchor - DAY;
  while (weekday(end) === 0 || weekday(end) === 6) end -= DAY;
  const endMonday = end - ((weekday(end) + 6) % 7) * DAY;
  const start = endMonday - 49 * DAY;
  const days = [];
  for (let t = start; t <= end; t += DAY) if (weekday(t) !== 0 && weekday(t) !== 6) days.push(t);
  return { anchor, end, start, days, termStart: start };
}

const COURSES = [
  {
    id: 'saha-demo-course-eng',
    code: 'ENG-5',
    title: 'English: reading and writing',
    description: 'Reading aloud, understanding short texts and writing a few connected sentences.',
    key: 'eng',
  },
  {
    id: 'saha-demo-course-math',
    code: 'MATH-5',
    title: 'Mathematics',
    description: 'Numbers, fractions and shapes, with practice that builds step by step.',
    key: 'math',
  },
  {
    id: 'saha-demo-course-sci',
    code: 'SCI-5',
    title: 'Science and our world',
    description: 'Plants, water and everyday materials, learned through simple investigations.',
    key: 'sci',
  },
];
const TEACHERS = [
  { id: 'saha-demo-teacher', name: 'Kavya Menon', role: 'teacher' },
  { id: 'saha-demo-teacher-2', name: 'Rohan Deshmukh', role: 'teacher' },
  { id: 'saha-demo-teacher-3', name: 'Farida Qureshi', role: 'teacher' },
  { id: 'saha-demo-teacher-4', name: 'Joseph Dsouza', role: 'teacher' },
];
const CLASSES = [
  {
    id: 'saha-demo-class-eng-5a',
    course: 'eng',
    section: 'a',
    teacher: 'saha-demo-teacher',
    name: 'English 5A',
    days: [1, 3, 5],
    schedule: 'Mon, Wed, Fri · 9:00',
  },
  {
    id: 'saha-demo-class-eng-5b',
    course: 'eng',
    section: 'b',
    teacher: 'saha-demo-teacher',
    name: 'English 5B',
    days: [1, 3, 5],
    schedule: 'Mon, Wed, Fri · 10:00',
  },
  {
    id: 'saha-demo-class-math-5a',
    course: 'math',
    section: 'a',
    teacher: 'saha-demo-teacher-2',
    name: 'Mathematics 5A',
    days: [1, 2, 4, 5],
    schedule: 'Mon, Tue, Thu, Fri · 11:00',
  },
  {
    id: 'saha-demo-class-math-5b',
    course: 'math',
    section: 'b',
    teacher: 'saha-demo-teacher-3',
    name: 'Mathematics 5B',
    days: [1, 2, 4, 5],
    schedule: 'Mon, Tue, Thu, Fri · 12:00',
  },
  {
    id: 'saha-demo-class-sci-5a',
    course: 'sci',
    section: 'a',
    teacher: 'saha-demo-teacher',
    name: 'Science 5A',
    days: [2, 4],
    schedule: 'Tue, Thu · 11:30',
  },
  {
    id: 'saha-demo-class-sci-5b',
    course: 'sci',
    section: 'b',
    teacher: 'saha-demo-teacher-4',
    name: 'Science 5B',
    days: [2, 4],
    schedule: 'Tue, Thu · 13:00',
  },
];
const SUBJECT_FACTOR = { eng: 1, math: 0.93, sci: 0.97 };
const ASSESSMENTS = [
  {
    key: 'eng-1',
    course: 'eng',
    title: 'Reading quiz: putting events in order',
    kind: 'quiz',
    max: 10,
    offset: 34,
  },
  { key: 'eng-2', course: 'eng', title: 'Mid-term reading test', kind: 'exam', max: 40, offset: 20 },
  { key: 'eng-3', course: 'eng', title: 'Story retelling project', kind: 'project', max: 20, offset: 8 },
  {
    key: 'eng-4',
    course: 'eng',
    title: 'Reading quiz: the main idea',
    kind: 'quiz',
    max: 10,
    offset: 2,
    only: 'saha-demo-class-eng-5a',
    unmarked: true,
  },
  { key: 'math-1', course: 'math', title: 'Number sense quiz', kind: 'quiz', max: 20, offset: 33 },
  { key: 'math-2', course: 'math', title: 'Mid-term mathematics test', kind: 'exam', max: 50, offset: 19 },
  { key: 'math-3', course: 'math', title: 'Fractions practice', kind: 'assignment', max: 25, offset: 7 },
  { key: 'sci-1', course: 'sci', title: 'Plants and seeds quiz', kind: 'quiz', max: 15, offset: 32 },
  { key: 'sci-2', course: 'sci', title: 'Mid-term science test', kind: 'exam', max: 40, offset: 18 },
  { key: 'sci-3', course: 'sci', title: 'Water cycle project', kind: 'project', max: 20, offset: 6 },
];
const FEEDBACK_HIGH = [
  'Clear answers. Keep explaining your thinking.',
  'Strong work. You used details from the text.',
  'Very careful work this time.',
];
const FEEDBACK_MID = [
  'Good effort. Check your answers once more before you finish.',
  'You are close. Try adding one more detail to each answer.',
  'Steady progress since the last quiz.',
];
const FEEDBACK_LOW = [
  'Let us go over this together in class.',
  'Please bring your questions to the next lesson.',
  'A good start. We will practise this topic again.',
];
const READING_PASSAGES = [
  'Passage 1: The market day',
  'Passage 2: A seed in the pot',
  'Passage 3: The lost umbrella',
  'Passage 4: Rain on the roof',
  'Passage 5: The village well',
  'Passage 6: A train at night',
  'Passage 7: The new bicycle',
  'Passage 8: Kites over the river',
];
const HINDI_PASSAGES = [
  'अनुच्छेद 1: मेले का दिन',
  'अनुच्छेद 2: नदी किनारे',
  'अनुच्छेद 3: दादी की कहानी',
  'अनुच्छेद 4: बारिश का मौसम',
  'अनुच्छेद 5: गाँव का कुआँ',
  'अनुच्छेद 6: रात की रेल',
  'अनुच्छेद 7: नई साइकिल',
  'अनुच्छेद 8: नदी पर पतंगें',
];
const HINDI_LEARNERS = new Set([31, 32, 33, 34]);

function grade(percent) {
  return percent >= 85 ? 'A' : percent >= 70 ? 'B' : percent >= 55 ? 'C' : percent >= 40 ? 'D' : 'E';
}

// ---------- table collection ----------
class Tables {
  constructor() {
    this.order = [];
    this.data = new Map();
  }
  add(table, columns, rows) {
    if (!rows.length) return;
    if (!this.data.has(table)) {
      this.data.set(table, { columns, rows: [] });
      this.order.push(table);
    }
    const entry = this.data.get(table);
    if (entry.columns.join() !== columns.join()) throw new Error('Column mismatch for ' + table);
    entry.rows.push(...rows);
  }
  count(table) {
    return this.data.get(table)?.rows.length ?? 0;
  }
  statements() {
    const out = [];
    for (const table of this.order) {
      const { columns, rows } = this.data.get(table);
      for (let i = 0; i < rows.length; i += 40) {
        out.push(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n` +
            rows
              .slice(i, i + 40)
              .map((row) => '(' + row.map(sqlValue).join(', ') + ')')
              .join(',\n') +
            ';',
        );
      }
    }
    return out;
  }
}

/** Builds every statement, in dependency order, for one synthetic school. */
export function buildDemo({
  anchor = new Date().toISOString().slice(0, 10),
  installationId = DEMO_INSTALLATION_ID,
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || day(utc(anchor)) !== anchor)
    throw new Error('Use --anchor YYYY-MM-DD');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(installationId))
    throw new Error('The installation id must be a version 4 UUID');
  const calendar = buildCalendar(anchor);
  const year = anchor.slice(0, 4);
  const term = `Term 1, ${year}`;
  const stamp = iso(calendar.start - 30 * DAY + 8 * 3600000);
  const tables = new Tables();
  const { learners, guardians, link } = buildPeople();
  const learnerById = new Map(learners.map((l) => [l.id, l]));

  tables.add(
    'schools',
    ['id', 'name', 'address', 'created_at', 'updated_at'],
    [[DEMO_SCHOOL_ID, DEMO_SCHOOL_NAME, 'Fictional campus, River Road', stamp, stamp]],
  );

  const userCols = [
    'id',
    'name',
    'email',
    'role',
    'identity_issuer',
    'identity_subject',
    'disabled_at',
    'school_id',
    'created_at',
    'updated_at',
  ];
  const accounts = [
    { id: 'saha-demo-admin', name: 'Anjali Verma', role: 'admin' },
    ...TEACHERS,
    { id: 'saha-demo-guardian', name: 'Sunita Iyer', role: 'guardian' },
    { id: 'saha-demo-student', name: 'Maya Iyer', role: 'student' },
  ];
  tables.add(
    'users',
    userCols,
    accounts.map((a) => [
      a.id,
      a.name,
      a.id + '@example.invalid',
      a.role,
      DEMO_ISSUER,
      a.id,
      null,
      DEMO_SCHOOL_ID,
      stamp,
      stamp,
    ]),
  );

  tables.add(
    'students',
    [
      'id',
      'user_id',
      'school_id',
      'first_name',
      'last_name',
      'date_of_birth',
      'admission_number',
      'grade_level',
      'created_at',
      'updated_at',
    ],
    learners.map((l) => [
      l.id,
      l.n === 1 ? 'saha-demo-student' : null,
      DEMO_SCHOOL_ID,
      l.first,
      l.last,
      l.birth,
      l.admission,
      '5',
      stamp,
      stamp,
    ]),
  );

  tables.add(
    'guardians',
    ['id', 'school_id', 'user_id', 'name', 'phone', 'email', 'relationship', 'created_at', 'updated_at'],
    guardians.map((g) => [
      g.id,
      DEMO_SCHOOL_ID,
      g.n === 1 ? 'saha-demo-guardian' : null,
      g.name,
      null,
      'guardian-' + pad(g.n) + '@example.invalid',
      g.relationship,
      stamp,
      stamp,
    ]),
  );
  tables.add(
    'student_guardians',
    ['student_id', 'guardian_id', 'is_primary'],
    link.map(([s, g]) => [s, g, 1]),
  );

  tables.add(
    'courses',
    ['id', 'school_id', 'code', 'title', 'description', 'grade_level', 'created_at', 'updated_at'],
    COURSES.map((c) => [c.id, DEMO_SCHOOL_ID, c.code, c.title, c.description, '5', stamp, stamp]),
  );
  tables.add(
    'classes',
    ['id', 'school_id', 'course_id', 'teacher_id', 'name', 'term', 'schedule', 'created_at', 'updated_at'],
    CLASSES.map((c) => [
      c.id,
      DEMO_SCHOOL_ID,
      'saha-demo-course-' + c.course,
      c.teacher,
      c.name,
      term,
      c.schedule,
      stamp,
      stamp,
    ]),
  );

  // Enrolments: every learner follows the three courses of their own section.
  const enrolments = [];
  const dayAt = (index) => calendar.days[index];
  const withdrawnOn = dayAt(Math.min(25, calendar.days.length - 6));
  for (const l of learners)
    for (const c of CLASSES.filter((c) => c.section === l.section)) {
      const withdrawn = l.n === withdrawnLearner && c.id === 'saha-demo-class-sci-5a';
      enrolments.push({
        id: `saha-demo-enrolment-${pad(l.n)}-${c.course}`,
        learner: l,
        klass: c,
        status: withdrawn ? 'withdrawn' : 'active',
        enrolledAt: iso(calendar.start - 7 * DAY + 9 * 3600000),
        updatedAt: withdrawn ? iso(withdrawnOn + 9 * 3600000) : iso(calendar.start - 7 * DAY + 9 * 3600000),
      });
    }
  tables.add(
    'enrolments',
    ['id', 'student_id', 'class_id', 'status', 'enrolled_at', 'created_at', 'updated_at'],
    enrolments.map((e) => [
      e.id,
      e.learner.id,
      e.klass.id,
      e.status,
      e.enrolledAt,
      e.enrolledAt,
      e.updatedAt,
    ]),
  );

  // Attendance for each class meeting in the window.
  const attendanceRows = [];
  const attendanceByDay = new Map(); // `${classId}|${learnerId}|${date}` -> status
  for (const e of enrolments) {
    const r = rng('attendance-' + e.id);
    const base = lowAttendance.get(e.learner.n) ?? clamp(0.9 + (e.learner.ability - 0.65) * 0.1, 0.86, 0.97);
    for (const t of calendar.days) {
      if (!e.klass.days.includes(weekday(t))) continue;
      if (e.status === 'withdrawn' && t > withdrawnOn) continue;
      const u = r();
      let status = 'present',
        note = null;
      if (u >= base) {
        const excused = r() < 0.35;
        status = excused ? 'excused' : 'absent';
        if (excused) note = 'Family let us know in advance';
      } else if (r() < 0.05) status = 'late';
      attendanceByDay.set(`${e.klass.id}|${e.learner.id}|${day(t)}`, status);
      const when = iso(t + 9 * 3600000 + 30 * 60000);
      attendanceRows.push([
        `saha-demo-att-${e.klass.id.slice(16)}-${pad(e.learner.n)}-${day(t).replaceAll('-', '')}`,
        e.klass.id,
        e.learner.id,
        day(t),
        status,
        note,
        e.klass.teacher,
        when,
        when,
      ]);
    }
  }
  tables.add(
    'attendance',
    ['id', 'class_id', 'student_id', 'date', 'status', 'note', 'recorded_by', 'created_at', 'updated_at'],
    attendanceRows,
  );

  // Assessments and results.
  const assessmentRows = [],
    resultRows = [],
    assessmentList = [];
  for (const c of CLASSES)
    for (const a of ASSESSMENTS.filter((a) => a.course === c.course && (!a.only || a.only === c.id))) {
      const date = day(calendar.anchor - a.offset * DAY);
      const id = `saha-demo-assessment-${c.id.slice(16)}-${a.key.split('-')[1]}`;
      assessmentList.push({ id, classId: c.id, title: a.title, date, kind: a.kind, max: a.max });
      const when = iso(utc(date) + 14 * 3600000);
      assessmentRows.push([id, c.id, a.title, a.kind, a.max, date, when, when]);
      if (a.unmarked) continue;
      for (const e of enrolments.filter(
        (e) => e.klass.id === c.id && (e.status === 'active' || utc(date) <= withdrawnOn),
      )) {
        // Two learners missed the English mid-term for 5A and have no result yet.
        if (a.key === 'eng-2' && c.id === 'saha-demo-class-eng-5a' && [3, 12].includes(e.learner.n)) continue;
        const r = rng(`result-${id}-${e.learner.n}`);
        const fraction = clamp(e.learner.ability * SUBJECT_FACTOR[c.course] + (r() - 0.5) * 0.22, 0.12, 1);
        const score = Math.round(fraction * a.max);
        const percent = (score / a.max) * 100;
        const feedback =
          r() < 0.3
            ? (percent >= 75 ? FEEDBACK_HIGH : percent >= 55 ? FEEDBACK_MID : FEEDBACK_LOW)[
                Math.floor(r() * 3)
              ]
            : null;
        resultRows.push([
          `saha-demo-result-${id.slice(21)}-${pad(e.learner.n)}`,
          id,
          e.learner.id,
          score,
          a.kind === 'exam' ? grade(percent) : null,
          feedback,
          when,
          when,
        ]);
      }
    }
  tables.add(
    'assessments',
    ['id', 'class_id', 'title', 'kind', 'max_score', 'date', 'created_at', 'updated_at'],
    assessmentRows,
  );
  tables.add(
    'assessment_results',
    ['id', 'assessment_id', 'student_id', 'score', 'grade', 'feedback', 'created_at', 'updated_at'],
    resultRows,
  );

  // Term report cards: Grade 5A is published by the administrator, 5B stays a private staff draft.
  const reportWhen = iso(calendar.end + 15 * 3600000);
  const reportRows = learners.map((l) => {
    const overall = grade(l.ability * 100 + 3);
    const strongest =
      l.ability > 0.72
        ? 'reads fluently and explains answers with care'
        : l.ability > 0.55
          ? 'is gaining confidence in reading and number work'
          : 'is working hard and benefits from short, regular practice';
    return [
      `saha-demo-report-${pad(l.n)}`,
      l.id,
      term,
      `${l.first} ${strongest}. Next step: keep a short reading time at home each evening.`,
      overall,
      null,
      reportWhen,
      reportWhen,
    ];
  });
  tables.add(
    'report_cards',
    ['id', 'student_id', 'term', 'summary', 'overall_grade', 'published_at', 'created_at', 'updated_at'],
    reportRows,
  );

  // Reading checks: weekly reviewed observations in the English classes. A learner who was away that day has none.
  const readingRows = [];
  const weeks = [...new Set(calendar.days.map((t) => t - ((weekday(t) + 6) % 7) * DAY))].sort(
    (x, y) => x - y,
  );
  for (const e of enrolments.filter((e) => e.klass.course === 'eng')) {
    const l = e.learner,
      hindi = HINDI_LEARNERS.has(l.n);
    weeks.forEach((weekStart, index) => {
      const wednesday = weekStart + 2 * DAY;
      if (wednesday > calendar.end) return;
      const key = `${e.klass.id}|${l.id}|${day(wednesday)}`;
      if (
        attendanceByDay.get(key) &&
        attendanceByDay.get(key) !== 'present' &&
        attendanceByDay.get(key) !== 'late'
      )
        return;
      const r = rng(`reading-${l.n}-${index}`);
      const durationMs = 60000;
      const wcpm =
        (hindi ? 38 : 52) + l.ability * (hindi ? 34 : 46) + index * (hindi ? 1.6 : 2.2) + (r() - 0.5) * 8;
      const attempted = clamp(Math.round(wcpm * 1.06), 20, 220);
      const accuracy = clamp(0.9 + l.ability * 0.07 + index * 0.003 + (r() - 0.5) * 0.04, 0.82, 0.995);
      const correct = clamp(Math.round(attempted * accuracy), 0, attempted);
      const created = iso(wednesday + 10 * 3600000 + 15 * 60000);
      readingRows.push([
        `saha-demo-reading-${pad(l.n)}-${pad(index + 1)}`,
        DEMO_SCHOOL_ID,
        e.klass.id,
        l.id,
        'saha-demo-teacher',
        'oral-reading-fluency',
        'manual-reviewed-external',
        hindi ? 'hi-IN' : 'en-IN',
        hindi ? HINDI_PASSAGES[index % 8] : READING_PASSAGES[index % 8],
        day(wednesday),
        durationMs,
        attempted,
        correct,
        created,
      ]);
    });
  }
  tables.add(
    'reading_checks',
    [
      'id',
      'school_id',
      'class_id',
      'student_id',
      'recorded_by',
      'source_app_id',
      'provenance',
      'language',
      'passage_reference',
      'reading_date',
      'duration_ms',
      'words_attempted',
      'words_correct',
      'created_at',
    ],
    readingRows,
  );

  // Teaching resources, approved versions, assignments and curriculum references.
  const at = (offset) => iso(calendar.anchor - offset * DAY + 11 * 3600000);
  const resources = [
    {
      id: 'saha-demo-resource-seed',
      author: 'saha-demo-teacher',
      versions: [
        {
          n: 1,
          title: 'A seed becomes a tree',
          type: 'worksheet',
          subject: 'English',
          language: 'en-IN',
          curriculum: 'Synthetic demonstration curriculum',
          approved: true,
          objectives: 'Put events in order. Support an answer with a detail from the passage.',
          body: 'Maya planted a seed in a small pot. Each morning she checked the soil and added a little water when it was dry. After a week, a green shoot appeared. She moved the pot near the window.\n\n1. What happened first?\n2. Why did Maya move the pot? Use a detail from the passage.\n3. Write one question you would ask Maya.',
          notes:
            'Read the passage aloud once before learners begin. Allow a picture to support the third answer.',
          key: '1. Maya planted a seed.\n2. The shoot needs light. Accept a supported reason.\n3. Accept any question about the story.',
          offset: 30,
        },
      ],
    },
    {
      id: 'saha-demo-resource-fractions',
      author: 'saha-demo-teacher-2',
      versions: [
        {
          n: 1,
          title: 'Fractions on a number line',
          type: 'quiz',
          subject: 'Mathematics',
          language: 'en-IN',
          curriculum: 'Synthetic demonstration curriculum',
          approved: true,
          objectives: 'Place halves, quarters and thirds on a number line.',
          body: '1. Mark one half on the line from 0 to 1.\n2. Mark one quarter.\n3. Is two thirds closer to 0 or to 1? Explain.\n4. Write two fractions that are equal to one half.',
          notes: 'Give each learner a printed number line. Ask them to say their reasoning aloud.',
          key: '1. Midpoint.\n2. Halfway between 0 and one half.\n3. Closer to 1.\n4. For example 2/4 and 3/6.',
          offset: 21,
        },
        {
          n: 2,
          title: 'Fractions on a number line (with a challenge)',
          type: 'quiz',
          subject: 'Mathematics',
          language: 'en-IN',
          curriculum: 'Synthetic demonstration curriculum',
          approved: false,
          objectives: 'Place halves, quarters and thirds on a number line, then compare two fractions.',
          body: '1. Mark one half on the line from 0 to 1.\n2. Mark one quarter.\n3. Is two thirds closer to 0 or to 1? Explain.\n4. Write two fractions that are equal to one half.\n5. Challenge: which is larger, three quarters or two thirds?',
          notes: 'Draft with one extra question. Waiting for review.',
          key: '5. Three quarters is larger.',
          offset: 3,
        },
      ],
    },
    {
      id: 'saha-demo-resource-water',
      author: 'saha-demo-teacher',
      versions: [
        {
          n: 1,
          title: 'Where does rain come from?',
          type: 'lesson',
          subject: 'Science',
          language: 'en-IN',
          curriculum: 'Synthetic demonstration curriculum',
          approved: true,
          objectives: 'Describe how water moves from the ground to the sky and back.',
          body: 'Warm sun turns water in rivers and puddles into vapour that we cannot see. The vapour rises, cools and forms tiny drops in clouds. When the drops grow heavy they fall as rain.\n\nTry this: place a cold plate over a bowl of warm water and watch the drops form underneath.',
          notes: 'Use warm tap water, not hot. Keep the activity at the front of the room.',
          key: 'Evaporation, condensation, rain.',
          offset: 14,
        },
      ],
    },
    {
      id: 'saha-demo-resource-expression',
      author: 'saha-demo-teacher',
      versions: [
        {
          n: 1,
          title: 'Reading with expression',
          type: 'activity',
          subject: 'English',
          language: 'en-IN',
          curriculum: 'Synthetic demonstration curriculum',
          approved: false,
          objectives: 'Read a short text aloud with natural pauses.',
          body: "Work in pairs. Take turns reading one paragraph of today's story. The listener tells the reader one thing that sounded good and one place to pause.",
          notes: 'Draft. Not yet reviewed or shared with learners.',
          key: 'No answer key needed.',
          offset: 2,
        },
      ],
    },
    {
      id: 'saha-demo-resource-hindi',
      author: 'saha-demo-teacher',
      versions: [
        {
          n: 1,
          title: 'मेले का दिन',
          type: 'worksheet',
          subject: 'Hindi',
          language: 'hi-IN',
          curriculum: 'Synthetic demonstration curriculum',
          approved: true,
          objectives: 'छोटे अनुच्छेद को पढ़कर प्रश्नों के उत्तर लिखना।',
          body: 'गाँव में आज मेला लगा है। रीना अपने दादाजी के साथ झूला देखने गई। उसने मीठी जलेबी खाई और एक छोटा सा खिलौना खरीदा।\n\n1. रीना किसके साथ मेले में गई?\n2. उसने क्या खाया?\n3. आप मेले में क्या करना चाहेंगे?',
          notes: 'अनुच्छेद एक बार ज़ोर से पढ़ें, फिर बच्चों को लिखने दें।',
          key: '1. दादाजी के साथ।\n2. जलेबी।\n3. कोई भी उचित उत्तर।',
          offset: 10,
        },
      ],
    },
  ];
  const resourceVersionRows = [];
  for (const res of resources)
    for (const v of res.versions) {
      const created = at(v.offset);
      resourceVersionRows.push([
        `${res.id}-v${v.n}`,
        res.id,
        v.n,
        v.title,
        v.type,
        v.curriculum,
        '5',
        v.subject,
        v.language,
        v.objectives,
        v.body,
        v.notes,
        v.key,
        res.author,
        created,
        v.approved ? 'saha-demo-admin' : null,
        v.approved ? iso(Date.parse(created) + 3600000) : null,
      ]);
    }
  tables.add(
    'teaching_resources',
    ['id', 'school_id', 'author_id', 'created_at'],
    resources.map((r) => [r.id, DEMO_SCHOOL_ID, r.author, at(r.versions[0].offset)]),
  );
  tables.add(
    'resource_versions',
    [
      'id',
      'resource_id',
      'version',
      'title',
      'type',
      'curriculum',
      'grade_level',
      'subject',
      'language',
      'objectives',
      'body',
      'teacher_notes',
      'answer_key',
      'created_by',
      'created_at',
      'approved_by',
      'approved_at',
    ],
    resourceVersionRows,
  );
  const assignments = [
    [
      'saha-demo-assignment-seed-5a',
      'saha-demo-resource-seed',
      'saha-demo-resource-seed-v1',
      'saha-demo-class-eng-5a',
      'saha-demo-teacher',
      12,
      5,
    ],
    [
      'saha-demo-assignment-seed-5b',
      'saha-demo-resource-seed',
      'saha-demo-resource-seed-v1',
      'saha-demo-class-eng-5b',
      'saha-demo-teacher',
      12,
      5,
    ],
    [
      'saha-demo-assignment-fractions-5a',
      'saha-demo-resource-fractions',
      'saha-demo-resource-fractions-v1',
      'saha-demo-class-math-5a',
      'saha-demo-teacher-2',
      8,
      3,
    ],
    [
      'saha-demo-assignment-water-5a',
      'saha-demo-resource-water',
      'saha-demo-resource-water-v1',
      'saha-demo-class-sci-5a',
      'saha-demo-teacher',
      6,
      7,
    ],
    [
      'saha-demo-assignment-hindi-5b',
      'saha-demo-resource-hindi',
      'saha-demo-resource-hindi-v1',
      'saha-demo-class-eng-5b',
      'saha-demo-teacher',
      4,
      9,
    ],
  ];
  tables.add(
    'resource_assignments',
    ['id', 'resource_id', 'version_id', 'class_id', 'assigned_by', 'created_at', 'due_date'],
    assignments.map(([id, res, ver, cls, by, made, due]) => [
      id,
      res,
      ver,
      cls,
      by,
      at(made),
      day(calendar.anchor + due * DAY),
    ]),
  );

  const references = [
    {
      id: 'saha-demo-reference-sequence',
      title: 'Reading: putting events in order',
      subject: 'English',
      objectives: 'Learners retell the events of a short text in the order they happened.',
      body: 'By the end of Grade 5, learners should be able to read a short story and say what happened first, next and last. They should use words such as first, then, after and finally.',
    },
    {
      id: 'saha-demo-reference-fractions',
      title: 'Mathematics: fractions on a number line',
      subject: 'Mathematics',
      objectives: 'Learners place simple fractions on a number line and compare them.',
      body: 'Learners place halves, quarters and thirds on a number line from 0 to 1 and explain which fraction is closer to a whole.',
    },
    {
      id: 'saha-demo-reference-water',
      title: 'Science: how water moves',
      subject: 'Science',
      objectives: 'Learners describe evaporation, condensation and rain in their own words.',
      body: 'Learners describe how water leaves the ground as vapour, cools into clouds and returns as rain, using a simple investigation to show it.',
    },
  ];
  tables.add(
    'curriculum_references',
    ['id', 'school_id', 'author_id', 'created_at'],
    references.map((r) => [r.id, DEMO_SCHOOL_ID, 'saha-demo-admin', at(40)]),
  );
  tables.add(
    'curriculum_reference_versions',
    [
      'id',
      'reference_id',
      'version',
      'title',
      'curriculum',
      'grade_level',
      'subject',
      'language',
      'objectives',
      'body',
      'rights_statement',
      'source_reference',
      'source_url',
      'created_by',
      'created_at',
      'approved_by',
      'approved_at',
    ],
    references.map((r) => [
      r.id + '-v1',
      r.id,
      1,
      r.title,
      'Synthetic demonstration curriculum',
      '5',
      r.subject,
      'en-IN',
      r.objectives,
      r.body,
      'Written for this demonstration school. It is not taken from any licensed source.',
      'Synthetic demo reference',
      null,
      'saha-demo-admin',
      at(40),
      'saha-demo-admin',
      at(39),
    ]),
  );
  tables.add(
    'resource_reference_bindings',
    [
      'id',
      'resource_id',
      'resource_version_id',
      'reference_id',
      'reference_version_id',
      'selected_by',
      'created_at',
    ],
    [
      [
        'saha-demo-binding-seed',
        'saha-demo-resource-seed',
        'saha-demo-resource-seed-v1',
        'saha-demo-reference-sequence',
        'saha-demo-reference-sequence-v1',
        'saha-demo-teacher',
        at(30),
      ],
      [
        'saha-demo-binding-fractions',
        'saha-demo-resource-fractions',
        'saha-demo-resource-fractions-v1',
        'saha-demo-reference-fractions',
        'saha-demo-reference-fractions-v1',
        'saha-demo-teacher-2',
        at(21),
      ],
      [
        'saha-demo-binding-water',
        'saha-demo-resource-water',
        'saha-demo-resource-water-v1',
        'saha-demo-reference-water',
        'saha-demo-reference-water-v1',
        'saha-demo-teacher',
        at(14),
      ],
    ],
  );

  // The demo learner has handed in the first worksheet and received reviewed feedback.
  tables.add(
    'submission_attempts',
    ['id', 'assignment_id', 'version_id', 'student_id', 'submitted_by', 'attempt', 'response', 'created_at'],
    [
      [
        'saha-demo-submission-1',
        'saha-demo-assignment-seed-5a',
        'saha-demo-resource-seed-v1',
        'saha-demo-learner-01',
        'saha-demo-student',
        1,
        '1. Maya planted a seed.\n2. She moved the pot near the window because the green shoot needs light.\n3. How tall will the plant grow?',
        at(9),
      ],
    ],
  );
  tables.add(
    'submission_feedback',
    ['id', 'submission_id', 'revision', 'feedback', 'reviewed_by', 'reviewed_at'],
    [
      [
        'saha-demo-feedback-1',
        'saha-demo-submission-1',
        1,
        'Good work. Your answer to question 2 uses a detail from the passage. Next time, add a word like "because" to every answer.',
        'saha-demo-teacher',
        at(8),
      ],
    ],
  );

  // Notices. Report-published notices for linked guardians come from the publication trigger below.
  const notice = (id, user, title, body, offset, read) => [
    id,
    user,
    'in_app',
    title,
    body,
    read ? at(offset - 1) : null,
    at(offset),
    at(offset),
  ];
  tables.add(
    'notifications',
    ['id', 'user_id', 'channel', 'title', 'body', 'read_at', 'created_at', 'updated_at'],
    [
      notice(
        'saha-demo-notice-1',
        'saha-demo-guardian',
        'Parent and teacher meetings next week',
        'Meetings for Grade 5 are on Thursday afternoon. Please ask the class teacher for a time that suits you.',
        3,
        false,
      ),
      notice(
        'saha-demo-notice-2',
        'saha-demo-guardian',
        'Reading week starts on Monday',
        'All Grade 5 learners will read aloud every day. A short quiet reading time at home helps a lot.',
        10,
        true,
      ),
      notice(
        'saha-demo-notice-3',
        'saha-demo-teacher',
        'Weekly reading checks',
        "Please add this week's reading observations for English 5A and 5B before Friday.",
        2,
        false,
      ),
      notice(
        'saha-demo-notice-4',
        'saha-demo-teacher',
        'Term 1 reports are ready to review',
        'Draft reports for Grade 5B are waiting for your review before they are shared with families.',
        6,
        true,
      ),
      notice(
        'saha-demo-notice-5',
        'saha-demo-admin',
        'Grade 5A reports shared with families',
        'Term 1 reports for Grade 5A are now visible to linked guardians.',
        1,
        false,
      ),
      notice(
        'saha-demo-notice-6',
        'saha-demo-student',
        'New class resource',
        'Your English teacher added "A seed becomes a tree". Open Class resources to read it and write your answers.',
        12,
        true,
      ),
    ],
  );

  // Publishing Grade 5A reports through the receipt keeps the real rule (receipt, published date and family notice).
  const publishedLearners = learners.filter((l) => l.section === 'a');
  const receiptCols = ['id', 'report_id', 'student_id', 'school_id', 'published_by', 'published_at'];
  const receipts = publishedLearners.map((l) => [
    `saha-demo-receipt-${pad(l.n)}`,
    `saha-demo-report-${pad(l.n)}`,
    l.id,
    DEMO_SCHOOL_ID,
    'saha-demo-admin',
    iso(calendar.end + 16 * 3600000),
  ]);
  const receiptStatements = [
    `INSERT INTO report_publication_receipts (${receiptCols.join(', ')}) VALUES\n` +
      receipts.map((row) => '(' + row.map(sqlValue).join(', ') + ')').join(',\n') +
      ';',
  ];

  const installation = [
    `INSERT INTO demo_installations (id, school_id, seed_nonce, created_at) VALUES (${sqlValue(installationId)}, ${sqlValue(DEMO_SCHOOL_ID)}, ${sqlValue('rich-demo-seed-' + anchor)}, ${sqlValue(stamp)});`,
  ];

  const statements = [...tables.statements(), ...receiptStatements, ...installation];

  const manifest = {
    synthetic: true,
    anchor,
    term,
    installationId,
    schoolId: DEMO_SCHOOL_ID,
    schoolName: DEMO_SCHOOL_NAME,
    window: { first: day(calendar.start), last: day(calendar.end), schoolDays: calendar.days.length },
    accounts: {
      admin: 'saha-demo-admin',
      teacher: 'saha-demo-teacher',
      guardian: 'saha-demo-guardian',
      student: 'saha-demo-student',
    },
    otherTeachers: TEACHERS.slice(1).map((t) => t.id),
    counts: {
      learners: learners.length,
      guardianProfiles: guardians.length,
      classes: CLASSES.length,
      courses: COURSES.length,
      enrolments: enrolments.length,
      attendance: attendanceRows.length,
      assessments: assessmentRows.length,
      results: resultRows.length,
      readingChecks: readingRows.length,
      resources: resources.length,
      resourceVersions: resourceVersionRows.length,
      assignments: assignments.length,
      references: references.length,
      reports: reportRows.length,
      publishedReports: receipts.length,
      notices: tables.count('notifications'),
    },
    ids: {
      demoLearner: 'saha-demo-learner-01',
      siblingLearner: 'saha-demo-learner-21',
      demoFamilyProfile: 'saha-demo-guardian-01',
      classes: CLASSES.map((c) => c.id),
      assessments: assessmentList.map((a) => a.id),
      unmarkedAssessment: 'saha-demo-assessment-eng-5a-4',
      assignments: assignments.map((a) => a[0]),
      publishedReport: 'saha-demo-report-01',
      draftReport: 'saha-demo-report-21',
      withdrawnEnrolment: 'saha-demo-enrolment-17-sci',
      lowAttendanceLearners: [...lowAttendance.keys()].map((n) => 'saha-demo-learner-' + pad(n)),
      hindiResource: 'saha-demo-resource-hindi',
    },
    expect: {
      guardianNoticesAfterSeed: 3,
      learnerNames: learners.slice(0, 3).map((l) => l.first + ' ' + l.last),
    },
  };
  return { statements, manifest, learnerById };
}

/** A migrated in-memory database (every drizzle migration applied, foreign keys on). */
export function migratedDatabase(root = ROOT) {
  const files = readdirSync(join(root, 'drizzle'))
    .filter((f) => /^\d.*\.sql$/.test(f))
    .sort();
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of files)
    sqlite.exec(readFileSync(join(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  return sqlite;
}

/** The whole database as one SQL file: tables and indexes, then rows (parents before children), then triggers.
 * Triggers go last because `wrangler d1 execute --file` mis-splits rows that follow a trigger body, and because the rows
 * already hold what the triggers produced (for example the family notice for a published report). */
export function dumpDatabase(sqlite) {
  const objects = sqlite
    .prepare(
      "SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid",
    )
    .all();
  const finish = (text) => text.replace(/\s*;\s*$/, '') + ';';
  const out = [];
  for (const row of objects.filter((o) => o.type === 'table' || o.type === 'index' || o.type === 'view'))
    out.push(finish(row.sql));
  const tables = objects.filter((o) => o.type === 'table').map((o) => o.name);
  const dependsOn = new Map(
    tables.map((name) => [
      name,
      new Set(
        sqlite
          .prepare(`PRAGMA foreign_key_list("${name.replaceAll('"', '""')}")`)
          .all()
          .map((r) => r.table)
          .filter((t) => t !== name),
      ),
    ]),
  );
  const ordered = [],
    done = new Set();
  while (ordered.length < tables.length) {
    const next = tables.find(
      (name) => !done.has(name) && [...dependsOn.get(name)].every((t) => done.has(t) || !tables.includes(t)),
    );
    if (!next) throw new Error('Foreign keys form a cycle; the dump cannot be ordered');
    done.add(next);
    ordered.push(next);
  }
  for (const name of ordered) {
    const columns = sqlite
      .prepare(`PRAGMA table_info("${name.replaceAll('"', '""')}")`)
      .all()
      .map((c) => c.name);
    const rows = sqlite.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all();
    for (let i = 0; i < rows.length; i += 40) {
      out.push(
        `INSERT INTO ${name} (${columns.map((c) => '"' + c + '"').join(', ')}) VALUES\n` +
          rows
            .slice(i, i + 40)
            .map((row) => '(' + columns.map((c) => sqlValue(row[c])).join(', ') + ')')
            .join(',\n') +
          ';',
      );
    }
  }
  for (const row of objects.filter((o) => o.type === 'trigger')) out.push(finish(row.sql));
  return out.join('\n');
}

/** One signed-in session per role. Returns SQL plus the private cookie values; the hashes in SQL are SHA-256 of the cookie token. */
export function sessionFixtures(accountIds, now = Date.now()) {
  const cookies = {},
    rows = [];
  for (const id of accountIds) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('base64url');
    cookies[id] = `${SESSION_COOKIE}=${token}`;
    rows.push(`(${sqlValue(tokenHash)}, ${sqlValue(id)}, ${now + 8 * 3600000}, ${now})`);
  }
  return {
    sql: `INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at) VALUES\n${rows.join(',\n')};`,
    cookies,
  };
}

export function demoSql({ anchor, installationId, withSchema = false, sessions = false } = {}) {
  const built = buildDemo({ anchor, installationId });
  const statements = [...built.statements];
  let cookies = null;
  if (sessions) {
    const ids = [
      'saha-demo-admin',
      'saha-demo-teacher',
      'saha-demo-guardian',
      'saha-demo-student',
      'saha-demo-teacher-2',
    ];
    const made = sessionFixtures(ids);
    statements.push(made.sql);
    cookies = {
      ...made.cookies,
      admin: made.cookies['saha-demo-admin'],
      teacher: made.cookies['saha-demo-teacher'],
      guardian: made.cookies['saha-demo-guardian'],
      student: made.cookies['saha-demo-student'],
      'teacher-2': made.cookies['saha-demo-teacher-2'],
    };
  }
  if (!withSchema) return { sql: statements.join('\n') + '\n', manifest: built.manifest, cookies };
  // Apply the seed to a freshly migrated database so every constraint and trigger is exercised, then write out its final state.
  const sqlite = migratedDatabase();
  try {
    sqlite.exec(statements.join('\n'));
    const violations = sqlite.prepare('PRAGMA foreign_key_check').all();
    if (violations.length) throw new Error('The seed breaks a foreign key: ' + JSON.stringify(violations[0]));
    return { sql: dumpDatabase(sqlite) + '\n', manifest: built.manifest, cookies };
  } finally {
    sqlite.close();
  }
}

// ---------- command line ----------
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const out = option('--out');
  if (!out || args.includes('--help')) {
    console.error(
      'Usage: node scripts/seed-demo.mjs --out file.sql [--with-schema] [--anchor YYYY-MM-DD] [--installation uuid] [--sessions file.json] [--manifest file.json]',
    );
    process.exit(out ? 0 : 2);
  }
  const result = demoSql({
    anchor: option('--anchor'),
    installationId: option('--installation'),
    withSchema: args.includes('--with-schema'),
    sessions: Boolean(option('--sessions')),
  });
  writeFileSync(out, result.sql, { mode: 0o600 });
  if (option('--sessions'))
    writeFileSync(option('--sessions'), JSON.stringify(result.cookies, null, 2), { mode: 0o600 });
  if (option('--manifest'))
    writeFileSync(option('--manifest'), JSON.stringify(result.manifest, null, 2) + '\n', { mode: 0o600 });
  console.log(
    `Synthetic demo school written: ${result.manifest.counts.learners} learners, ${result.manifest.counts.attendance} attendance records, ${result.manifest.counts.readingChecks} reading checks.`,
  );
}
