import assert from 'node:assert/strict';
import {freshDatabase,seedSecurityData,load} from '../support/security-db.mjs';
const {db,schema,sqlite}=freshDatabase();await seedSecurityData(db,schema);
const schools=await load('lib/education/schools.ts');const courses=await load('lib/education/courses.ts');
const admin={id:'admin-a',role:'admin',schoolId:'a'};
const tests=[];const test=(name,fn)=>tests.push({name,fn});
test('School admin cannot provision another school',async()=>assert.rejects(()=>schools.createSchool(admin,{name:'Unapproved school'})));
test('School reads are tenant scoped',async()=>{
 assert.deepEqual((await schools.listSchools(admin)).map(r=>r.id),['a']);assert.equal(await schools.getSchool(admin,'b'),null);
});
test('Admin can update own school and cannot update another',async()=>{
 assert.equal((await schools.updateSchool(admin,'a',{name:'Updated synthetic school'})).name,'Updated synthetic school');
 await assert.rejects(()=>schools.updateSchool(admin,'b',{name:'Cross-school attempt'}));
 assert.equal(sqlite.prepare('SELECT name FROM schools WHERE id=?').get('b').name,'Synthetic school b');
});
test('Admin can create and read a course in own school',async()=>{
 const record=await courses.createCourse(admin,{schoolId:'a',code:'MATH101',title:'Synthetic mathematics',gradeLevel:'8'});
 assert.ok(record.id);assert.ok(record.createdAt);assert.equal((await courses.getCourse(admin,record.id)).code,'MATH101');
});
test('Cross-school course creation rejected',async()=>{
 await assert.rejects(()=>courses.createCourse(admin,{schoolId:'b',code:'DENIED',title:'Invalid',gradeLevel:'8'}));
 assert.equal(sqlite.prepare("SELECT count(*) n FROM courses WHERE code='DENIED'").get().n,0);
});
test('Unknown or other-school course is invisible',async()=>{
 assert.equal(await courses.getCourse(admin,'missing'),null);assert.equal(await courses.getCourse(admin,'course-b'),null);
});
let passed=0,failed=0;for(const {name,fn} of tests){try{await fn();passed++;console.log('ok - '+name);}catch(e){failed++;console.error('not ok - '+name+' '+e.stack);}}
console.log(JSON.stringify({passed,failed,skipped:0}));sqlite.close();process.exitCode=failed?1:0;
