// Generate a reviewed SQL fixture; never contact a provider or write a live database.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const arguments_ = process.argv.slice(2);
const value = name => arguments_[arguments_.indexOf(name) + 1];
const usage = 'Usage: node scripts/provision-synthetic-identities.mjs --synthetic --fixture <json> --output <sql>';
if (!arguments_.includes('--synthetic') || !arguments_.includes('--fixture') || !arguments_.includes('--output') ||
    !value('--fixture') || !value('--output')) throw new Error(usage);
const fixture = JSON.parse(readFileSync(resolve(value('--fixture')), 'utf8'));
if (fixture.synthetic !== true || !Array.isArray(fixture.schools) || !Array.isArray(fixture.users)) {
  throw new Error('Only explicit synthetic fixtures with schools and users are supported');
}
const string = (value, label) => {
  if (typeof value !== 'string' || !value || value.length > 512) throw new Error(`Invalid ${label}`);
  return value;
};
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const schoolIds = new Set();
const userIds = new Set();
const identities = new Set();
const emails = new Set();
const statements = ['-- SYNTHETIC ONLY. Review before applying to an isolated local database.', 'BEGIN TRANSACTION;'];
for (const school of fixture.schools) {
  const id = string(school.id, 'school ID');
  if (schoolIds.has(id)) throw new Error('Duplicate school ID');
  schoolIds.add(id);
  const name = string(school.name, 'school name');
  statements.push(`INSERT INTO schools(id,name,created_at,updated_at) VALUES (${quote(id)},${quote(name)},datetime('now'),datetime('now'));`);
}
for (const user of fixture.users) {
  const id = string(user.id, 'user ID');
  const schoolId = string(user.schoolId, 'school ID');
  const name = string(user.name, 'name');
  const email = string(user.email, 'email').toLowerCase();
  const issuer = string(user.identityIssuer, 'issuer');
  const subject = string(user.identitySubject, 'subject');
  const url = new URL(issuer);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.test') || url.username || url.password || url.search || url.hash ||
      !email.endsWith('@example.test') || !schoolIds.has(schoolId) ||
      !['admin', 'teacher', 'guardian', 'student'].includes(user.role)) {
    throw new Error('Fixture must use HTTPS .test issuers, @example.test recipients, valid roles and fixture schools');
  }
  const identity = `${issuer}\u0000${subject}`;
  if (userIds.has(id) || identities.has(identity) || emails.has(email)) throw new Error('Duplicate user, email or identity');
  userIds.add(id); identities.add(identity); emails.add(email);
  statements.push(`INSERT INTO users(id,name,email,role,school_id,identity_issuer,identity_subject,created_at,updated_at) VALUES (${[id,name,email,user.role,schoolId,issuer,subject].map(quote).join(',')},datetime('now'),datetime('now'));`);
}
statements.push('COMMIT;', '');
writeFileSync(resolve(value('--output')), statements.join('\n'), { flag: 'wx', mode: 0o600 });
console.log(`Generated ${fixture.users.length} synthetic identities. No database or provider was changed.`);
