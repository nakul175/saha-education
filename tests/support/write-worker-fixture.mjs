// Creates only synthetic schema/rows/session credentials for isolated local workerd tests.
import {writeFileSync} from 'node:fs';
import {freshDatabase,seedSecurityData,load} from './security-db.mjs';
const output = process.argv[2];const credentials = process.argv[3];
if (!output || !credentials) throw new Error('Supply SQL and session fixture output paths.');
const {db,schema,sqlite}=freshDatabase();await seedSecurityData(db,schema);
const session=await load('lib/education/session.ts');
const tokens={};for(const id of ['admin-a','teacher-a','guardian-a','student-user-a']) tokens[id]=(await session.createSession(id)).split(';')[0];
const statements=[];
for(const row of sqlite.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC").all()) statements.push(row.sql+';');
const quote=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
for(const name of ['schools','users','students','guardians','student_guardians','courses','classes','enrolments','assessments','attendance','assessment_results','report_cards','notifications','auth_sessions','oidc_transactions','auth_rate_limits']) {
 for(const row of sqlite.prepare(`SELECT * FROM "${name}"`).all()) statements.push(`INSERT INTO "${name}" (${Object.keys(row).map(k=>'"'+k+'"').join(',')}) VALUES (${Object.values(row).map(quote).join(',')});`);
}
writeFileSync(output,statements.join('\n'),{mode:0o600});writeFileSync(credentials,JSON.stringify(tokens),{mode:0o600});
sqlite.close();console.log('Synthetic local Worker schema and session fixture created; no database or provider changed.');
