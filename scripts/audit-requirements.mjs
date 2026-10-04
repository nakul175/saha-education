import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=JSON.parse(readFileSync('requirements/brd-v1.1.json','utf8'));
const lines=readFileSync('requirements/assessment.tsv','utf8').trimEnd().split('\n'),headers=lines.shift().split('\t'),assessment=lines.map(l=>Object.fromEntries(l.split('\t').map((v,i)=>[headers[i],v])));
const evidence=JSON.parse(readFileSync('requirements/evidence-map.json','utf8'));
// Audit label and date for the current development state (defaults preserve the R11 edition).
const meta=existsSync('requirements/audit-meta.json')?JSON.parse(readFileSync('requirements/audit-meta.json','utf8')):{auditedAt:meta.auditedAt,engineeringRelease:meta.engineeringRelease,title:'Release 11'};
const rows=source.requirements.map(r=>{const a=assessment.find(a=>a.id===r.id);assert.ok(a,`Missing ${r.id}`);const key=r.id.startsWith('NFR-')?r.id:r.id.split('-').slice(0,2).join('-');const e=evidence[r.id]??evidence[key];assert.ok(e,`Evidence context missing for ${r.id}`);return {...r,...a,acceptanceStatus:'pending',evidenceContext:e,automatedAcceptanceClaim:false};});
assert.equal(rows.length,176);assert.equal(assessment.length,176);assert.equal(new Set(rows.map(r=>r.id)).size,176);assert.equal(new Set(assessment.map(r=>r.id)).size,176);
assert.equal(rows.filter(r=>r.id.startsWith('BR-')).length,148);assert.equal(rows.filter(r=>r.id.startsWith('NFR-')).length,28);
for(const r of rows){assert.ok(['implemented-local','partial','not-built','unverified'].includes(r.implementation));assert.match(r.target,/^R1[1-6]$/);assert.ok(r.current&&r.remaining&&r.requirement&&r.acceptance);for(const p of r.evidenceContext)assert.ok(existsSync(p),`${r.id}: missing ${p}`);}
const counts=Object.fromEntries(['implemented-local','partial','not-built','unverified'].map(k=>[k,rows.filter(r=>r.implementation===k).length]));
const manifest={auditedAt:meta.auditedAt,engineeringRelease:meta.engineeringRelease,source:source.source,counts,acceptance:{pending:176,accepted:0},definitions:{'implemented-local':'The described local control exists; acceptance and external validation remain pending.',partial:'A foundation exists, with functional and/or operating gaps.', 'not-built':'No complete implementation of the specified capability.',unverified:'The required measurable outcome has not been established.'},evidenceNote:'Paths point to related implementation, synthetic tests or gap documentation. They do not assert that every clause is tested. No BRD acceptance is claimed; each row retains its exact source acceptance criterion and a remaining-work statement.',requirements:rows};
const quote=s=>'"'+String(s??'').replaceAll('"','""')+'"';
const cols=['id','title','priority','brdRelease','implementation','acceptanceStatus','target','current','remaining','requirement','acceptance','evidenceContext'];
const csv=cols.join(',')+'\n'+rows.map(r=>cols.map(k=>quote(Array.isArray(r[k])?r[k].join('; '):r[k])).join(',')).join('\n')+'\n';
const esc=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
let md=`# BRD v1.1 requirements traceability — ${meta.title}\n\nAll **176 requirements** are assessed: 148 functional and 28 non-functional. Source: ${source.source.filename}, SHA-256 \`${source.source.sha256}\`. The exact requirement and acceptance text is preserved in [the source extract](requirements/brd-v1.1.json) and [the complete CSV](requirements/traceability.csv).\n\n| Implementation assessment | Count |\n| --- | ---: |\n`;
for(const [k,n] of Object.entries(counts))md+=`| ${k} | ${n} |\n`;
md+='\n**Formal acceptance: 0 accepted; 176 pending.** Local implementation and synthetic assertions are not clinical, field, regulatory, integration or production acceptance. These counts are not a completion percentage. BRD R1/R2/R3 are scope phases; engineering R10–R16 are delivery batches and are not equivalent. Targets are planned primary work batches, subject to dependencies and findings.\n\nEvidence paths identify related code/tests or explicit gap documentation, not full test coverage. All requirements retain their source acceptance criterion in the CSV/JSON. The five future batches, open R11 dependencies and other remaining work are in [REMAINING-RELEASES.md](REMAINING-RELEASES.md).\n\n';
for(const group of [...new Set(rows.map(r=>r.id.startsWith('NFR')?'NFR':r.id.split('-').slice(0,2).join('-'))) ]){
 md+=`## ${group}\n\n| Requirement | Priority / BRD phase | Assessment / target | Current behaviour | Remaining work | Related evidence context |\n| --- | --- | --- | --- | --- | --- |\n`;
 for(const r of rows.filter(r=>r.id.startsWith(group+'-')))md+=`| ${r.id} — ${esc(r.title)} | ${r.priority} / ${r.brdRelease} | ${r.implementation} / ${r.target} | ${esc(r.current)} | ${esc(r.remaining)} | ${r.evidenceContext.map(p=>`[${p}](${p})`).join('<br>')} |\n`;
 md+='\n';
}
const outputs={'requirements/traceability.json':JSON.stringify(manifest,null,2)+'\n','requirements/traceability.csv':csv,'REQUIREMENTS-TRACEABILITY.md':md};
if(process.argv.includes('--check')){for(const [p,content] of Object.entries(outputs))assert.equal(readFileSync(p,'utf8'),content,`Regenerate ${p}`);console.log('176 source IDs, assessments, evidence paths and generated records verified; acceptance remains pending.');}
else{for(const [p,content] of Object.entries(outputs))writeFileSync(p,content);console.log(JSON.stringify(counts));}
