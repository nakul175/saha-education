import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';
const { db, schema, sqlite } = freshDatabase(); await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const collection = await load('app/api/reading-imports/route.ts');
const detail = await load('app/api/reading-imports/[id]/route.ts');
const decision = await load('app/api/reading-imports/[id]/decision/route.ts');
const tables = await load('db/reading-import-schema.ts');
const origin = 'https://education.example.invalid'; bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = {}; for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a']) sessions[id] = (await createSession(id)).split(';')[0];
const today = new Date().toISOString().slice(0,10);
const row = { externalReference: 'synthetic-result-1', studentId: 'student-a', language: 'en-IN', passageReference: 'Synthetic passage A', readingDate: today, durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 90 };
const envelope = { format: 'saha.reading-results.v1', classId: 'class-a', sourceLabel: 'Synthetic declared namespace', sourceReference: 'Synthetic reviewed batch', rows: [row, { ...row, externalReference: 'synthetic-result-2', durationSeconds: 30, wordsCorrect: 80 }] };
const staged = () => ({ clientImportId: crypto.randomUUID(), envelope });
const reviewed = (action='confirm') => ({ clientDecisionId: crypto.randomUUID(), expectedRevision: 0, action, confirmReviewed: true, reason: 'Reviewed synthetic counts against local source.' });
let checks=0; function check(actual,expected,message) { assert.deepEqual(actual,expected,message); checks++; }
function count(table) { return sqlite.prepare('SELECT count(*) n FROM '+table).get().n; }
function request(user, method='GET', value, badOrigin=false) { const headers={origin:badOrigin?'https://attacker.example.invalid':origin}; if(user) headers.cookie=sessions[user]; const init={method,headers}; if(value!==undefined) { headers['content-type']='application/json'; init.body=JSON.stringify(value); } return new Request(origin+'/api/reading-imports',init); }
function decide(user,id,input) { return decision.POST(request(user,'POST',input), {params:Promise.resolve({id})}); }
function get(user,id) { return detail.GET(request(user), {params:Promise.resolve({id})}); }
const originalFetch=globalThis.fetch; let networkCalls=0; globalThis.fetch=async()=>{networkCalls++;throw new Error('Local imports must never fetch external sources');};
try {
  for(const method of ['GET','POST']) check((await collection[method](request(null,method,method==='POST'?staged():undefined))).status,401,'Anonymous import denied');
  for(const user of ['guardian-a','student-user-a']) {
    check((await collection.GET(request(user))).status,403,'Family import inventory denied');
    check((await collection.POST(new Request(request(user,'POST'),{body:'{bad'}))).status,403,'Wrong role denied before parsing');
    check((await decide(user,'missing',reviewed())).status,403,'Family decision denied');
  }
  check((await collection.POST(request('teacher-a','POST',staged(),true))).status,403,'Same-origin stage required');
  check((await collection.POST(request('teacher-other','POST',staged()))).status,404,'Unassigned teacher cannot stage');
  check((await collection.POST(request('admin-b','POST',staged()))).status,404,'Foreign-school administrator cannot stage');
  const invalid=[{rows:[]},{rows:Array.from({length:26},(_,i)=>({...row,externalReference:'row-'+i}))},{rows:[row,row]},
    {format:'vendor-verified'},{sourceLabel:' namespace '},{rows:[{...row,wordsCorrect:101}]},{rows:[{...row,studentName:'Synthetic'}]},
    {rows:[{...row,readingDate:'2026-02-30'}]},{rows:[{...row,durationSeconds:0}]},{rows:[{...row,language:'english'}]},{fileUrl:'https://source.example.invalid/export'}];
  for(const patch of invalid) check((await collection.POST(request('teacher-a','POST',{...staged(),envelope:{...envelope,...patch}}))).status,400,'Strict normalized envelope rejected');
  const tooLarge=new Request(request('teacher-a','POST'),{body:' '.repeat(128*1024+1)});
  check((await collection.POST(tooLarge)).status,400,'128 KiB import body bound');
  check(count('reading_checks'),0,'Invalid staging writes no observations');
  const input=staged(); let response=await collection.POST(request('teacher-a','POST',input));
  check(response.status,201,'Staff stage a local normalized draft'); let saved=await response.json(); const id=saved.draft.id;
  check(saved.items.length,2,'Stage preview contains normalized rows'); check(saved.draft.status,'staged','Preview remains unreviewed');
  check(saved.items[0].receipt,null,'No provider or consumption receipt before review'); check(saved.items[0].wcpm,90,'Preview score derived locally');
  check(count('reading_checks'),0,'Staged rows are not readings');
  response=await collection.POST(request('teacher-a','POST',input)); check(response.status,201,'Exact stage retry'); check(await response.json(),saved,'Stage retry preserves item/check identities');
  check((await collection.POST(request('teacher-a','POST',{...input,envelope:{...envelope,sourceReference:'Changed'}}))).status,409,'Changed stage retry conflicts');
  check((await get('teacher-other',id)).status,404,'Draft belongs to creator/current authorized staff'); check((await get('admin-b',id)).status,404,'Cross-school detail denied');
  check((await get('admin-a',id)).status,200,'Current-class school admin reads staged evidence');
  for(const patch of [{confirmReviewed:false},{reason:''},{expectedRevision:1},{action:'publish'},{reviewedBy:'admin-a'}]) check((await decide('teacher-a',id,{...reviewed(),...patch})).status,400,'Explicit strict decision required');
  const firstDecision=reviewed(); response=await decide('teacher-a',id,firstDecision); check(response.status,200,'Explicit reviewed confirmation succeeds'); saved=await response.json();
  check(saved.draft.status,'confirmed','Confirmation terminal status'); check(saved.draft.reviewedBy,'teacher-a','Authenticated reviewer attribution');
  check(count('reading_checks'),2,'Confirmation creates all readings'); check(count('reading_import_receipts'),2,'Every source item has durable consumption receipt');
  for(const item of saved.items) { check(item.receipt.sourceLabel,envelope.sourceLabel,'Receipt namespace is explicitly declared'); check(item.receipt.externalReference,item.externalReference,'Stable source result reference retained'); }
  check(sqlite.prepare('SELECT DISTINCT provenance p FROM reading_checks').all().map(v=>v.p),['manual-reviewed-external'],'Original readings remain educator-reviewed manual provenance');
  check(sqlite.prepare('SELECT DISTINCT recorded_by a FROM reading_checks').all().map(v=>v.a),['teacher-a'],'Review actor is original reading recorder');
  response=await decide('teacher-a',id,firstDecision); check(response.status,200,'Exact confirmation replay'); check(await response.json(),saved,'Replay preserves timestamp and receipt');
  check((await decide('admin-a',id,firstDecision)).status,409,'Different actor cannot claim confirmation retry');
  check((await decide('teacher-a',id,{...firstDecision,reason:'Changed reason.'})).status,409,'Changed decision retry rejected');
  check((await decide('teacher-a',id,reviewed('reject'))).status,409,'Confirmed evidence cannot be rejected later');
  response=await collection.POST(request('teacher-a','POST',input)); check((await response.json()).draft.status,'confirmed','Old staging replay returns current state');
  const duplicateInput={...staged(),envelope:{...envelope,rows:[{...row,externalReference:'fresh-source-result'},row]}};
  response=await collection.POST(request('teacher-a','POST',duplicateInput)); const duplicate=await response.json();
  check((await decide('teacher-a',duplicate.draft.id,reviewed())).status,409,'Duplicate consumed result across import IDs conflicts');
  check(count('reading_checks'),2,'Receipt conflict rolls back every new observation'); check(count('reading_import_receipts'),2,'Receipt conflict leaves no partial receipts');
  check((await (await get('teacher-a',duplicate.draft.id)).json()).draft.status,'staged','Conflicting confirmation leaves pending draft');
  check((await decide('teacher-a',duplicate.draft.id,reviewed('reject'))).status,200,'Pending duplicate may be explicitly rejected');
  const newDraft=await (await collection.POST(request('teacher-a','POST',{...staged(),envelope:{...envelope,sourceLabel:'Another synthetic namespace'}}))).json();
  const race=await Promise.all([decide('teacher-a',newDraft.draft.id,reviewed()),decide('teacher-a',newDraft.draft.id,reviewed('reject'))]);
  check(race.map(v=>v.status).sort(),[200,409],'CAS terminal decision has one winner');
  const retryDraft=await (await collection.POST(request('teacher-a','POST',{...staged(),envelope:{...envelope,sourceLabel:'Retry synthetic namespace'}}))).json();
  const retryInput=reviewed(); const retry=await Promise.all([decide('teacher-a',retryDraft.draft.id,retryInput),decide('teacher-a',retryDraft.draft.id,retryInput)]);
  check(retry.map(v=>v.status),[200,200],'Concurrent same decision retry succeeds'); check(...await Promise.all(retry.map(v=>v.json())),'Retry retains exact one decision');
  const pending=await (await collection.POST(request('teacher-a','POST',{...staged(),envelope:{...envelope,sourceLabel:'Withdrawal synthetic namespace'}}))).json();
  sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE student_id='student-a'").run();
  check((await decide('teacher-a',pending.draft.id,reviewed())).status,409,'Withdrawal denies confirmation');
  check((await (await get('teacher-a',pending.draft.id)).json()).items[0].eligible,false,'Withdrawn staged values remain readable with explicit ineligibility');
  check((await decide('teacher-a',pending.draft.id,reviewed('reject'))).status,200,'Current staff may reject withdrawn historical draft');
  sqlite.prepare("UPDATE enrolments SET status='active' WHERE student_id='student-a'").run();
  const originalDb=globalThis.__sahaTestDb;
  function beforeWrite(table,mutation,operation='update') { globalThis.__sahaTestDb=new Proxy(originalDb,{get(target,key){ if(key===operation) return candidate=>{if(candidate===table){globalThis.__sahaTestDb=originalDb;mutation();}return target[key](candidate);}; const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}); }
  const revokedDraft=await (await collection.POST(request('teacher-a','POST',{...staged(),envelope:{...envelope,sourceLabel:'Revocation namespace'}}))).json();
  const before=count('reading_checks'); beforeWrite(tables.readingImportDrafts,()=>sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run());
  check((await decide('teacher-a',revokedDraft.draft.id,reviewed())).status,404,'Actual decision SQL rechecks assigned teacher'); check(count('reading_checks'),before,'Reassignment creates no observations');
  sqlite.prepare("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'").run();
  beforeWrite(tables.readingImportDrafts,()=>sqlite.prepare("UPDATE users SET disabled_at='revoked' WHERE id='teacher-a'").run());
  check((await decide('teacher-a',revokedDraft.draft.id,reviewed())).status,404,'Actual decision SQL rechecks enabled account');
  sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='teacher-a'").run();
  beforeWrite(tables.readingImportDrafts,()=>sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE student_id='student-a'").run());
  check((await decide('teacher-a',revokedDraft.draft.id,reviewed())).status,409,'Actual decision SQL rechecks active enrollment');
  sqlite.prepare("UPDATE enrolments SET status='active' WHERE student_id='student-a'").run();
  beforeWrite(tables.readingImportDrafts,()=>sqlite.prepare("UPDATE users SET disabled_at='revoked' WHERE id='teacher-a'").run(),'insert');
  check((await collection.POST(request('teacher-a','POST',staged()))).status,404,'Revoked stage INSERT creates no draft');
  sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='teacher-a'").run(); globalThis.__sahaTestDb=originalDb;
  // Identical declared result references remain isolated by school.
  const foreignInput={...staged(),envelope:{...envelope,classId:'class-b',rows:envelope.rows.map(r=>({...r,studentId:'student-b'}))}};
  check(await (await collection.GET(request('admin-b'))).json(),[],'Foreign administrator receives no source metadata from another school');
  const foreignDraft=await (await collection.POST(request('admin-b','POST',foreignInput))).json();
  check((await decide('admin-b',foreignDraft.draft.id,reviewed())).status,200,'School namespace permits same declared source references independently');
  check((await get('admin-a',foreignDraft.draft.id)).status,404,'Foreign receipt metadata remains inaccessible');
  // A persistence failure late in the trigger rolls back readings and outcome.
  const rollbackDraft=await (await collection.POST(request('teacher-a','POST',{...staged(),envelope:{...envelope,sourceLabel:'Atomic rollback namespace'}}))).json();
  const checkBefore=count('reading_checks'),receiptBefore=count('reading_import_receipts');
  sqlite.exec("CREATE TRIGGER synthetic_import_receipt_failure BEFORE INSERT ON reading_import_receipts WHEN NEW.source_label='Atomic rollback namespace' AND NEW.external_reference='synthetic-result-2' BEGIN SELECT RAISE(ABORT,'Synthetic receipt failure'); END");
  const rollbackDecision=reviewed();
  check((await decide('teacher-a',rollbackDraft.draft.id,rollbackDecision)).status,500,'Unexpected receipt failure fails closed');
  check(count('reading_checks'),checkBefore,'Late receipt failure rolls back every observation');
  check(count('reading_import_receipts'),receiptBefore,'Late receipt failure rolls back earlier receipt');
  check((await (await get('teacher-a',rollbackDraft.draft.id)).json()).draft.status,'staged','Failed trigger rolls back terminal decision');
  sqlite.exec('DROP TRIGGER synthetic_import_receipt_failure');
  check((await decide('teacher-a',rollbackDraft.draft.id,rollbackDecision)).status,200,'Same local decision safely recovers after proven atomic rollback');
  // The last detail SELECT repeats live authority, after parent validation.
  globalThis.__sahaTestDb=new Proxy(originalDb,{get(target,key){if(key==='select')return (...args)=>{const builder=target.select(...args);return new Proxy(builder,{get(query,member){if(member==='from')return table=>{if(table===tables.readingImportItems){globalThis.__sahaTestDb=originalDb;sqlite.prepare("UPDATE users SET disabled_at='revoked-at-detail-read' WHERE id='teacher-a'").run();}return query.from(table);};const value=Reflect.get(query,member,query);return typeof value==='function'?value.bind(query):value;}});};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  check((await get('teacher-a',id)).status,404,'Downstream preview/receipt SELECT denies revoked actor');
  sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='teacher-a'").run();globalThis.__sahaTestDb=originalDb;
  assert.throws(()=>sqlite.prepare('UPDATE reading_import_items SET words_correct=1').run(),/immutable/);checks++;
  assert.throws(()=>sqlite.prepare('DELETE FROM reading_import_receipts').run(),/immutable/);checks++;
  check(networkCalls,0,'No vendor API, file URLs or external requests');
  console.log(`Reading imports contract: ${checks} checks passed (normalized manual staging, atomic SQLite review/provenance and real sessions; synthetic only).`);
  console.log(JSON.stringify({passed:checks,failed:0,skipped:0}));
} finally {globalThis.fetch=originalFetch;sqlite.close();}
