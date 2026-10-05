import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const bindings = globalThis.__sahaBindings = {};
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === '@/db' || spec === '@/db/index') return {url: 'data:text/javascript,export const getDb = () => globalThis.__sahaTestDb;', shortCircuit: true};
    if (spec === 'cloudflare:workers') return {url: 'data:text/javascript,export const env = globalThis.__sahaBindings;', shortCircuit: true};
    if (spec === 'next/headers') return {url: 'data:text/javascript,export const cookies = async () => ({getAll: name => globalThis.__sahaCookies?.filter(v=>v.name===name) ?? []});', shortCircuit: true};
    let value = spec.startsWith('@/') ? pathToFileURL(join(root, spec.slice(2))).href : spec;
    if (value.startsWith('.') || value.startsWith('file:')) {
      const base = new URL(value, ctx.parentURL);
      if (existsSync(base)) return next(base.href, ctx);
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        const candidate = new URL(base.href + ext);
        if (existsSync(candidate)) return {url: candidate.href, shortCircuit: true};
      }
    }
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (url.endsWith('.ts') || url.endsWith('.tsx')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX}}).outputText,
    };
    return next(url, ctx);
  },
});
export const load = path => import(pathToFileURL(resolve(root, path)).href);
const schema = await load('db/schema.ts');
const {drizzle} = await import('drizzle-orm/sqlite-proxy');
export function freshDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(join(root,'drizzle')).filter(f=>/^\d.*\.sql$/.test(f)).sort()) {
    sqlite.exec(readFileSync(join(root,'drizzle',file),'utf8').replaceAll('--> statement-breakpoint',''));
  }
  function execute(sql,params,method) {
    const statement = sqlite.prepare(sql);
    if (method === 'run') { statement.run(...params); return {rows: []}; }
    // Preserve duplicate joined column names exactly as D1 raw array rows do.
    statement.setReturnArrays(true);
    if (method === 'get') { const row = statement.get(...params); return {rows: row ?? undefined}; }
    return {rows: statement.all(...params)};
  }
  const db = drizzle(async (...args)=>execute(...args), async queries => {
    sqlite.exec('BEGIN');
    try { const results = queries.map(q=>execute(q.sql,q.params,q.method)); sqlite.exec('COMMIT'); return results; }
    catch(e) {sqlite.exec('ROLLBACK'); throw e;}
  }, {schema});
  globalThis.__sahaTestDb=db;
  return {sqlite,db,schema};
}
export const stamp = '2026-10-05T00:00:00.000Z';
export async function seedSecurityData(db,schema) {
  await db.insert(schema.schools).values(['a','b'].map(id=>({id,name:'Synthetic school '+id,createdAt:stamp,updatedAt:stamp})));
  const accounts = [
    ['admin-a','admin','a'],['admin-b','admin','b'],['teacher-a','teacher','a'],['teacher-other','teacher','a'],
    ['teacher-b','teacher','b'],['guardian-a','guardian','a'],['guardian-other','guardian','a'],['guardian-b','guardian','b'],
    ['student-user-a','student','a'],['student-user-other','student','a'],['student-user-b','student','b'],
  ];
  await db.insert(schema.users).values(accounts.map(([id,role,schoolId])=>({id,name:id,email:id+'@example.invalid',role,schoolId,identityIssuer:'https://identity.example.invalid',identitySubject:'sub-'+id,createdAt:stamp,updatedAt:stamp})));
  await db.insert(schema.students).values([['student-a','a','student-user-a'],['student-other','a','student-user-other'],['student-b','b','student-user-b']].map(([id,schoolId,userId])=>({id,schoolId,userId,firstName:id,lastName:'Synthetic',dateOfBirth:'2012-01-01',admissionNumber:id,gradeLevel:'8',createdAt:stamp,updatedAt:stamp})));
  await db.insert(schema.guardians).values([['guardian-profile-a','a','guardian-a'],['guardian-profile-other','a','guardian-other'],['guardian-profile-b','b','guardian-b']].map(([id,schoolId,userId])=>({id,schoolId,userId,name:id,relationship:'parent',createdAt:stamp,updatedAt:stamp})));
  await db.insert(schema.studentGuardians).values([{studentId:'student-a',guardianId:'guardian-profile-a',isPrimary:1},{studentId:'student-other',guardianId:'guardian-profile-other',isPrimary:1},{studentId:'student-b',guardianId:'guardian-profile-b',isPrimary:1}]);
  await db.insert(schema.courses).values(['a','b'].map(schoolId=>({id:'course-'+schoolId,schoolId,code:'course-'+schoolId,title:'Synthetic math',gradeLevel:'8',createdAt:stamp,updatedAt:stamp})));
  await db.insert(schema.classes).values([['class-a','a','teacher-a'],['class-other','a','teacher-other'],['class-b','b','teacher-b']].map(([id,schoolId,teacherId])=>({id,schoolId,teacherId,courseId:'course-'+schoolId,name:id,term:'T1',createdAt:stamp,updatedAt:stamp})));
  await db.insert(schema.enrolments).values([['student-a','class-a'],['student-other','class-other'],['student-b','class-b']].map(([studentId,classId])=>({id:studentId+'-enrolment',studentId,classId,status:'active',enrolledAt:stamp,createdAt:stamp,updatedAt:stamp})));
  await db.insert(schema.assessments).values(['a','b'].map(id=>({id:'assessment-'+id,classId:'class-'+id,title:'Synthetic quiz',kind:'quiz',maxScore:20,date:'2026-10-05',createdAt:stamp,updatedAt:stamp})));
  await db.insert(schema.reportCards).values([{id:'published-a',studentId:'student-a',term:'T1',overallGrade:'A',publishedAt:stamp,createdAt:stamp,updatedAt:stamp},{id:'draft-a',studentId:'student-a',term:'T2',overallGrade:'B',createdAt:stamp,updatedAt:stamp},{id:'published-b',studentId:'student-b',term:'T1',overallGrade:'A',publishedAt:stamp,createdAt:stamp,updatedAt:stamp}]);
  await db.insert(schema.notifications).values(['guardian-a','guardian-other','guardian-b'].map(userId=>({id:'notice-'+userId,userId,channel:'in_app',title:'Synthetic notice',body:'Synthetic only',createdAt:stamp,updatedAt:stamp})));
}
