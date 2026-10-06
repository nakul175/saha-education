import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const routes = {
  collection: await load('app/api/resources/route.ts'),
  detail: await load('app/api/resources/[id]/route.ts'),
  versions: await load('app/api/resources/[id]/versions/route.ts'),
  approval: await load('app/api/resources/[id]/approve/route.ts'),
  assign: await load('app/api/resources/[id]/assign/route.ts'),
  assignments: await load('app/api/resource-assignments/route.ts'),
};
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = {};
for (const id of ['admin-a','admin-b','teacher-a','teacher-other','teacher-b','guardian-a','student-user-a','student-user-other']) {
  sessions[id] = (await createSession(id)).split(';')[0];
}
const content = { title: 'Synthetic fractions lesson', type: 'lesson', curriculum: 'Synthetic curriculum',
  gradeLevel: '8', subject: 'Mathematics', language: 'en-IN', objectives: 'Compare two fractions.',
  body: 'Compare 1/2 and 1/4. Explain your reasoning.', teacherNotes: 'Private teacher observation notes.', answerKey: '1/2 is greater than 1/4.' };
const resourceId = '35f38b72-de0b-454e-a31a-7b6c27e2f70d';
const create = {content, clientResourceId: resourceId};
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function request(user, method='GET', payload, suppliedOrigin=origin, query='') {
  const headers = {origin:suppliedOrigin};
  if (user) headers.cookie = sessions[user];
  const init = {method,headers};
  if (payload !== undefined) {headers['content-type']='application/json'; init.body=JSON.stringify(payload);}
  return new Request(origin + '/api/resources' + query, init);
}
const params = id => ({params:Promise.resolve({id})});
async function call(route, method, user, payload, id=resourceId, suppliedOrigin=origin, query='') {
  return routes[route][method](request(user,method,payload,suppliedOrigin,query),params(id));
}
async function read(route,user,id=resourceId,query='') {
  const response = await call(route,'GET',user,undefined,id,origin,query);
  check(response.status,200,route+' authorized read');
  check(response.headers.get('cache-control'),'no-store','Sensitive content remains uncached');
  return response.json();
}
const originalFetch=globalThis.fetch;
let networkCalls=0;
globalThis.fetch=async()=>{networkCalls++; throw new Error('Resource authoring must not contact a provider');};
try {
  const boundaries=[['collection','GET'],['collection','POST'],['detail','GET'],['detail','PATCH'],['versions','GET'],['approval','POST'],['assign','POST'],['assignments','GET']];
  for(const [route,method] of boundaries) {
    check((await call(route,method,null,method==='GET'?undefined:{})).status,401,'Anonymous resource endpoint denied');
    if(method!=='GET') check((await call(route,method,'teacher-a',{},resourceId,'https://attacker.example.invalid')).status,403,'Cross-origin mutation denied before parsing');
  }
  const legacy=new Request(origin+'/api/resources',{headers:{cookie:'saha_demo_role=admin'}});
  check((await routes.collection.GET(legacy)).status,401,'Legacy role cookie cannot authorize resources');
  for(const user of ['guardian-a','student-user-a']) {
    for(const route of ['collection','detail','versions']) check((await call(route,'GET',user)).status,403,'Families cannot read draft or teacher-only content');
    check((await call('collection','POST',user,create)).status,403,'Families cannot author resources');
  }
  check((await call('assignments','GET','guardian-a')).status,403,'Guardian assignment access unavailable');
  const noOrigin=request('teacher-a','POST',create); noOrigin.headers.delete('origin');
  check((await routes.collection.POST(noOrigin)).status,403,'Origin is mandatory');
  for(const payload of [{...create,authorId:'teacher-other'}, {...create,schoolId:'b'}, {...create,content:{...content,title:''}}, {...create,clientResourceId:'invalid'}]) {
    check((await call('collection','POST','teacher-a',payload)).status,400,'Invalid or authority-bearing authoring payload rejected');
  }
  const malformed=new Request(request('teacher-a','POST'),{body:'{invalid'});
  check((await routes.collection.POST(malformed)).status,400,'Malformed JSON rejected');

  let response=await call('collection','POST','teacher-a',create);
  check(response.status,201,'Teacher creates an authored draft');
  let resource=await response.json();
  check(resource.id,resourceId,'Resource UUID enables safe retry');
  check(resource.authorId,'teacher-a','Authenticated author persisted');
  check(resource.schoolId,'a','Authenticated school persisted');
  check(resource.latest.version,1,'Initial immutable version');
  check(resource.latest.approvedAt,null,'New content is unapproved');
  check(resource.latest.answerKey,content.answerKey,'Author retains private answer key');
  check((await read('assignments','student-user-a')).length,0,'Unassigned draft never appears in learner feed');
  for(const user of ['guardian-a','student-user-a']) {
    for(const [route,payload] of [['detail',{expectedVersion:1,content}],['approval',{versionId:resource.latest.id}],['assign',{versionId:resource.latest.id,classId:'class-a'}]]) {
      check((await call(route,route==='detail'?'PATCH':'POST',user,payload)).status,403,'Families cannot revise approve or assign drafts');
    }
  }
  const version1=resource.latest;
  response=await call('collection','POST','teacher-a',create);
  check(response.status,201,'Exact create retry succeeds');
  check(await response.json(),resource,'Retry preserves resource/version identity and timestamps');
  for(const user of ['teacher-other','teacher-b']) {
    check((await call('collection','POST',user,create)).status,409,'Foreign reuse cannot claim existing resource ID');
    check((await call('detail','GET',user)).status,404,'Non-author teacher cannot inspect draft');
  }
  check((await call('collection','POST','teacher-a',{...create,content:{...content,title:'Changed retry'}})).status,409,'Changed create retry conflicts');
  check((await read('collection','teacher-a')).length,1,'Author lists own resource');
  check((await read('collection','teacher-other')).length,0,'Same-school peer cannot list author draft');
  check((await read('collection','admin-a')).length,1,'School administrator can list staff drafts');
  check((await read('collection','admin-b')).length,0,'Cross-school administrator sees no resources');
  check((await call('detail','GET','admin-b')).status,404,'Cross-school administrator cannot inspect');

  check((await call('assign','POST','teacher-a',{versionId:version1.id,classId:'class-a'})).status,400,'Unapproved version cannot be assigned');
  response=await call('approval','POST','teacher-a',{versionId:version1.id});
  check(response.status,200,'Author approves reviewed version');
  const approved=await response.json();
  check(approved.approvedBy,'teacher-a','Approval attribution is server identity');
  check(typeof approved.approvedAt,'string','Approval time is recorded');
  response=await call('approval','POST','teacher-a',{versionId:version1.id});
  check(response.status,200,'Approval retry succeeds');
  check(await response.json(),approved,'Approval retry retains original evidence');
  check((await call('approval','POST','teacher-other',{versionId:version1.id})).status,404,'Peer cannot approve another author resource');
  check((await call('approval','POST','admin-b',{versionId:version1.id})).status,404,'Foreign admin cannot approve');
  check((await call('approval','POST','teacher-a',{versionId:'missing-version'})).status,404,'Unknown version cannot be approved');
  check((await call('approval','POST','teacher-a',{versionId:version1.id,approvedBy:'admin-a'})).status,400,'Caller cannot choose approval authority');

  for(const classId of ['class-other','class-b','missing-class']) {
    check((await call('assign','POST','teacher-a',{versionId:version1.id,classId})).status,404,'Author must also control assignment class');
  }
  response=await call('assign','POST','teacher-a',{versionId:version1.id,classId:'class-a',dueDate:'2026-12-01'});
  check(response.status,201,'Approved exact version assigned to owned class');
  const assignment=await response.json();
  check(assignment.versionId,version1.id,'Assignment pins immutable version');
  check(assignment.assignedBy,'teacher-a','Assignment attribution is server identity');
  response=await call('assign','POST','teacher-a',{versionId:version1.id,classId:'class-a',dueDate:'2026-12-01'});
  check(response.status,201,'Exact assignment retry succeeds');
  check(await response.json(),assignment,'Assignment retry retains original record');
  let learner=await read('assignments','student-user-a');
  check(learner.length,1,'Active enrolled student receives approved assignment');
  check(learner[0].resource.body,content.body,'Learner sees reviewed lesson content');
  check(Object.hasOwn(learner[0].resource,'answerKey'),false,'Answer keys excluded from learner JSON');
  check(Object.hasOwn(learner[0].resource,'teacherNotes'),false,'Teacher notes excluded from learner JSON');
  check(JSON.stringify(learner).includes(content.answerKey),false,'Private answer absent from entire response');
  check(JSON.stringify(learner).includes(content.teacherNotes),false,'Private notes absent from entire response');
  check((await read('assignments','student-user-a',resourceId,'?classId=class-b')).length,0,'Class filter cannot widen learner access');
  check((await read('assignments','student-user-other')).length,0,'Unassigned sibling-class student sees no assignment');
  check((await read('assignments','teacher-other')).length,0,'Unassigned teacher sees no assignment');
  check((await read('assignments','admin-b')).length,0,'Cross-school administrator sees no assignment');

  const nextContent={...content,title:'Synthetic fractions revision',body:'New draft lesson body',answerKey:'Private revised answer'};
  response=await call('detail','PATCH','teacher-a',{expectedVersion:1,content:nextContent});
  check(response.status,200,'Author appends revision');
  resource=await read('detail','teacher-a');
  check(resource.latest.version,2,'Revision increments version');
  check(resource.latest.approvedAt,null,'Approval never carries into revision');
  check(resource.latest.approvedBy,null,'Revision requires fresh review authority');
  check(resource.latest.answerKey,nextContent.answerKey,'New revision private key preserved for author');
  const version2=resource.latest;
  check((await call('detail','PATCH','teacher-a',{expectedVersion:1,content:{...nextContent,title:'Stale edit'}})).status,409,'Stale optimistic revision conflicts');
  let versions=await read('versions','teacher-a');
  check(versions.length,2,'Stale write adds no version');
  check(versions.find(version=>version.id===version1.id).body,content.body,'Old version content immutable');
  check(versions.find(version=>version.id===version1.id).approvedAt,approved.approvedAt,'Old approval evidence immutable');
  check((await call('assign','POST','teacher-a',{versionId:version2.id,classId:'class-a'})).status,400,'Unapproved revision cannot be assigned');
  learner=await read('assignments','student-user-a');
  check(learner[0].versionId,version1.id,'Existing assignment remains pinned after revision');
  check(learner[0].resource.body,content.body,'New draft never overwrites learner assignment');
  check((await call('detail','PATCH','teacher-other',{expectedVersion:2,content:nextContent})).status,404,'Peer cannot revise');
  check((await call('detail','PATCH','admin-b',{expectedVersion:2,content:nextContent})).status,404,'Foreign admin cannot revise');
  check((await call('detail','PATCH','teacher-a',{expectedVersion:0,content:nextContent})).status,400,'Invalid optimistic version rejected');
  check((await call('assign','POST','teacher-a',{versionId:version1.id,classId:'class-a',dueDate:'2026-02-30'})).status,400,'Impossible due date rejected');

  response=await call('collection','POST','teacher-a',{content:{...content,title:'Other synthetic resource'}});
  check(response.status,201,'Author may create another draft');
  const second=await response.json();
  response=await call('detail','PATCH','admin-a',{expectedVersion:1,content:{...content,title:'School administrator revision'}},second.id);
  check(response.status,200,'Same-school admin may append staff resource revision');
  const adminRevision=await response.json();
  check(adminRevision.authorId,'teacher-a','Admin revision preserves original resource author');
  check(adminRevision.latest.createdBy,'admin-a','Admin revision retains accurate attribution');
  check((await call('approval','POST','teacher-a',{versionId:second.latest.id})).status,404,'Version must belong to addressed resource');
  check((await call('assign','POST','teacher-a',{versionId:second.latest.id,classId:'class-a'})).status,404,'Foreign resource version cannot be assigned');
  // Real concurrent requests exercise database uniqueness and version arbitration.
  const simultaneousId='ee7a7ca5-2e6f-42cd-b9a3-e00ca171ed93';
  const simultaneous=await Promise.all([call('collection','POST','teacher-a',{content,clientResourceId:simultaneousId}),call('collection','POST','teacher-a',{content,clientResourceId:simultaneousId})]);
  check(simultaneous.map(result=>result.status),[201,201],'Concurrent identical create retries both succeed');
  const simultaneousBodies=await Promise.all(simultaneous.map(result=>result.json()));
  check(simultaneousBodies[0],simultaneousBodies[1],'Concurrent retries preserve one original resource/version');
  const competedId='fa2530e3-c4ac-48db-bb01-12f191631df1';
  const competitors=await Promise.all([call('collection','POST','teacher-a',{content,clientResourceId:competedId}),call('collection','POST','teacher-other',{content,clientResourceId:competedId})]);
  check(competitors.map(result=>result.status).sort(),[201,409],'Concurrent different actors cannot share resource retry ID');
  const revisions=await Promise.all([call('detail','PATCH','teacher-a',{expectedVersion:2,content:{...content,title:'Concurrent edit A'}},second.id),call('detail','PATCH','teacher-a',{expectedVersion:2,content:{...content,title:'Concurrent edit B'}},second.id)]);
  check(revisions.map(result=>result.status).sort(),[200,409],'Concurrent revisions allow exactly one winner');
  versions=await read('versions','teacher-a',second.id);
  check(versions.length,3,'Revision race appends exactly one new immutable version');
  check(versions[0].version,3,'Winning concurrent revision becomes version three');
  const approvals=await Promise.all([call('approval','POST','teacher-a',{versionId:versions[0].id},second.id),call('approval','POST','admin-a',{versionId:versions[0].id},second.id)]);
  check(approvals.map(result=>result.status),[200,200],'Concurrent confirmations succeed without overwriting first approval');
  const approvalBodies=await Promise.all(approvals.map(result=>result.json()));
  check(approvalBodies[0],approvalBodies[1],'Concurrent confirmation preserves one approver and timestamp');
  sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE student_id='student-a'").run();
  check((await read('assignments','student-user-a')).length,0,'Withdrawn student no longer sees class assignment');
  sqlite.prepare('UPDATE users SET disabled_at=? WHERE id=?').run('2026-10-05T00:00:00.000Z','teacher-a');
  check((await call('collection','GET','teacher-a')).status,401,'Disabled author session cannot read');
  check((await call('approval','POST','teacher-a',{versionId:version2.id})).status,401,'Disabled author session cannot mutate');
  sqlite.prepare('UPDATE users SET disabled_at=? WHERE id=?').run('2026-10-05T00:00:00.000Z','student-user-a');
  check((await call('assignments','GET','student-user-a')).status,401,'Disabled learner session cannot read assignments');
  check(networkCalls,0,'Manual resource workspace makes no external network calls');
  console.log(`Teacher resource contract: ${checks} checks passed (actual sessions/services against isolated SQLite; no AI provider or real students).`);
  console.log(JSON.stringify({passed:checks,failed:0,skipped:0}));
} finally {globalThis.fetch=originalFetch;sqlite.close();}
