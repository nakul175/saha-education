// Served built Worker with isolated local D1 and explicitly injected synthetic sessions.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const origin=process.env.SAHA_WORKER_TEST_URL;
const sessionPath=process.env.SAHA_WORKER_SESSION_FIXTURE;
if(!origin || !sessionPath) throw new Error('Set SAHA_WORKER_TEST_URL and SAHA_WORKER_SESSION_FIXTURE for an isolated synthetic local Worker.');
const url=new URL(origin);
if(!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('This fixture test only runs against localhost.');
const cookies=JSON.parse(readFileSync(sessionPath,'utf8'));
const request=(path,user,method='GET',body,foreignOrigin)=>fetch(new URL(path,origin),{method,redirect:'manual',headers:{...(user?{Cookie:cookies[user]}:{}),...(method!=='GET'?{Origin:foreignOrigin ?? origin,'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
const tests=[];const test=(name,fn)=>tests.push({name,fn});
for(const path of ['/api/students','/api/schools','/api/courses/course-a','/api/report-cards/published-a','/api/assessments/assessment-a/results','/api/notifications'])test('Unauthenticated '+path,async()=>assert.equal((await request(path)).status,401));
for(const path of ['/students','/dashboard/admin','/report-cards/published-a'])test('Protected page '+path,async()=>{
 const response=await request(path);assert.equal(response.status,307);assert.equal(new URL(response.headers.get('location'),origin).pathname,'/login');
});
test('Built Worker rejects legacy role selection',async()=>{
 const response=await fetch(new URL('/api/students',origin),{headers:{Cookie:'saha_demo_role=admin'}});assert.equal(response.status,401);
});
for(const [user,expected] of [['admin-a',['student-a','student-other']],['teacher-a',['student-a']],['guardian-a',['student-a']],['student-user-a',['student-a']]])test('Scoped served student list '+user,async()=>{
 const response=await request('/api/students',user);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual((await response.json()).map(r=>r.id).sort(),expected);
});
test('Cross-school served read is invisible',async()=>assert.equal((await request('/api/students/student-b','admin-a')).status,404));
test('Family draft report is invisible',async()=>assert.equal((await request('/api/report-cards/draft-a','guardian-a')).status,404));
test('Family published report is available',async()=>assert.equal((await request('/api/report-cards/published-a','guardian-a')).status,200));
test('Family cannot read unpublished assessment results',async()=>assert.equal((await request('/api/assessments/assessment-a/results','guardian-a')).status,403));
test('Foreign origin blocked on built Worker',async()=>assert.equal((await request('/api/report-cards/draft-a','admin-a','PATCH',{publish:true},'https://attacker.example.invalid')).status,403));
test('Guardians cannot acknowledge another user notice',async()=>assert.equal((await request('/api/notifications?id=notice-guardian-other','guardian-a','PATCH',{})).status,404));
test('Correct publication atomically creates user-mapped notice',async()=>{
 assert.equal((await request('/api/report-cards/draft-a','admin-a','PATCH',{publish:true})).status,200);
 assert.equal((await request('/api/report-cards/draft-a','admin-a','PATCH',{publish:true})).status,200);
 const response=await request('/api/notifications','guardian-a');const notices=await response.json();
 assert.equal(notices.filter(r=>r.id==='report-card-published:draft-a:guardian-a').length,1);
});
test('Unconfigured sign-in fails closed',async()=>assert.equal((await request('/api/auth/login',undefined,'POST',{})).status,503));
test('Valid server-page identity works in built Worker',async()=>{
 const response=await request('/dashboard/guardian','guardian-a');assert.equal(response.status,200);assert.match(await response.text(),/Guardian Dashboard/);
});
let passed=0,failed=0;for(const {name,fn} of tests){try{await fn();passed++;console.log('ok - '+name);}catch(e){failed++;console.error('not ok - '+name+' '+e.message);}}
console.log(JSON.stringify({passed,failed,skipped:0}));process.exitCode=failed?1:0;
