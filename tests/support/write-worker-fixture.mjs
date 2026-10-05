// Creates only synthetic schema/rows/session credentials for isolated local workerd tests.
import {writeFileSync} from 'node:fs';
import {freshDatabase,seedSecurityData,load} from './security-db.mjs';
const output = process.argv[2];const credentials = process.argv[3];
if (!output || !credentials) throw new Error('Supply SQL and session fixture output paths.');
const {db,schema,sqlite}=freshDatabase();await seedSecurityData(db,schema);
const session=await load('lib/education/session.ts');
const tokens={};for(const id of ['admin-a','admin-b','teacher-a','teacher-other','guardian-a','student-user-a']) tokens[id]=(await session.createSession(id)).split(';')[0];
const statements=[];
// Triggers reference existing tables; create them after tables and indexes.
for(const row of sqlite.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END, name").all()) statements.push(row.sql+';');
const quote=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
for(const name of ['schools','users','students','guardians','student_guardians','courses','classes','enrolments','assessments','attendance','assessment_results','report_cards','notifications','reading_checks','teaching_resources','resource_versions','resource_assignments','auth_sessions','oidc_transactions','auth_rate_limits']) {
 for(const row of sqlite.prepare(`SELECT * FROM "${name}"`).all()) statements.push(`INSERT INTO "${name}" (${Object.keys(row).map(k=>'"'+k+'"').join(',')}) VALUES (${Object.values(row).map(quote).join(',')});`);
}
writeFileSync(output,statements.join('\n'),{mode:0o600});writeFileSync(credentials,JSON.stringify(tokens),{mode:0o600});
sqlite.close();console.log('Synthetic local Worker schema and session fixture created; no database or provider changed.');
