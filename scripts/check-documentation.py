#!/usr/bin/env python3
"""Verify the R11 handover without modifying runtime, archives or test evidence."""
from pathlib import Path
from zipfile import ZipFile
import csv
import hashlib
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
errors = []
checks = {}


def require(condition, message):
    if not condition:
        errors.append(message)


def read_json(path):
    return json.loads((ROOT/path).read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


# The application baseline checked is the current one (docs/verification/current-baseline.json).
# Earlier baselines such as application-r11-sha256.json are retained unchanged as history.
pointer=ROOT/'docs/verification/current-baseline.json'
current_baseline=json.loads(pointer.read_text())['manifest'] if pointer.exists() else 'application-r11-sha256.json'
require((ROOT/'docs/verification/application-r11-sha256.json').is_file(),'R11 baseline manifest missing')
for name,key in [(current_baseline,'baselineSourceFiles'),('original-documents-sha256.json','originalFiles')]:
    manifest=read_json('docs/verification/'+name)['files']
    for filename,expected in manifest.items():
        path=ROOT/filename
        require(path.is_file() and digest(path)==expected,'Changed baseline file: '+filename)
    checks[key]=len(manifest)

history=ROOT/'docs/history/v1.0'
entries=0
with ZipFile(history/'Health-AI-Documentation-Pack-v1.0.zip') as archive:
    require(archive.testzip() is None,'Original documentation ZIP CRC error')
    for name in archive.namelist():
        path=history/Path(*Path(name).parts[1:])
        require(path.is_file() and path.read_bytes()==archive.read(name),'Extracted original differs: '+name)
        entries+=1
with ZipFile(history/'Health-AI-Engineering-Assets-v1.0.zip') as archive:
    require(archive.testzip() is None,'Original engineering ZIP CRC error')
    for name in archive.namelist():
        require((history/name).read_bytes()==archive.read(name),'Engineering archive differs: '+name)
checks['originalArchiveEntries']=entries

office=list(history.glob('*.docx'))+list((history/'source').glob('*.docx'))+list(history.glob('*.xlsx'))
for path in office:
    with ZipFile(path) as archive:
        require(archive.testzip() is None,'Office ZIP CRC error: '+path.name)
        ET.fromstring(archive.read('word/document.xml' if path.suffix=='.docx' else 'xl/workbook.xml'))
checks['unchangedOfficeFiles']=len(office)

source=read_json('requirements/brd-v1.1.json'); trace=read_json('requirements/traceability.json')
require(digest(history/'source'/source['source']['filename'])==source['source']['sha256'],'BRD source digest differs')
require(len(source['requirements'])==176,'BRD requirement count changed')
require(trace['acceptance']=={'pending':176,'accepted':0},'Formal acceptance changed')
require(sum(trace['counts'].values())==176 and set(trace['counts'])<= {'implemented-local','partial','not-built','unverified'},'Assessment counts inconsistent')
require([r['id'] for r in source['requirements']]==[r['id'] for r in trace['requirements']],'Traceability ID order differs')
for old,new in zip(source['requirements'],trace['requirements']):
    for key,value in old.items():
        require(new.get(key)==value,f'Source requirement differs: {old["id"]} {key}')
    for path in new['evidenceContext']:
        require((ROOT/path).exists(),'Missing evidence: '+path)
checks['requirements']=176

cases=read_json('docs/history/v1.0/engineering/test_catalogue.json')
with (ROOT/'docs/current/TEST-CATALOGUE.csv').open(newline='') as stream:
    current=list(csv.DictReader(stream))
require(len(cases)==len(current)==364,'Catalogue count differs')
for old,new in zip(cases,current):
    for key,value in old.items():
        require(new.get(key)==str(value),f'Original test field differs: {old["id"]} {key}')
    require(new['currentFormalExecution']=='Not run as a formal catalogue case','Unsupported case execution claim')
checks['preservedTestCases']=len(current)

for filename in ['COMMAND-CATALOGUE.csv','HTTP-ROUTES.csv','DATA-DICTIONARY.csv']:
    with (ROOT/'docs/current'/filename).open(newline='') as stream:
        for row in csv.DictReader(stream):
            path=ROOT/row['source']; require(path.is_file(),'Missing inventory source: '+row['source'])
            if 'line' in row:
                require(0<int(row['line'])<=len(path.read_text().splitlines()),'Invalid inventory line')

with (ROOT/'docs/current/EXECUTION-REGISTER.csv').open(newline='') as stream:
    reports=list(csv.DictReader(stream))
total=0
for row in reports:
    report=read_json(row['report']); path=ROOT/row['report']
    require(row['sha256']==digest(path),'Changed execution digest: '+row['report'])
    require(row['storedCompletedAt']==report.get('completedAt','Not recorded in this report'),'Invented result date')
    require((ROOT/row['reproduce'].removeprefix('node ')).exists(),'Missing reproduction script')
    total+=int(row['passedAssertions'] or 0)
require(total==1284,'R11 assertion total differs')
checks['historicalProductAssertions']=total

# Development-slice evidence: each folder's manifest pins its reports' digests and dates.
slice_total=0
for manifest_path in sorted((ROOT/'tests/evidence').glob('*/manifest.json')):
    manifest=json.loads(manifest_path.read_text())
    for report,meta in manifest['reports'].items():
        path=manifest_path.parent/report
        require(path.is_file() and digest(path)==meta['sha256'],'Changed slice evidence: '+str(path.relative_to(ROOT)))
        slice_total+=int(meta.get('passed') or 0)
checks['sliceEvidenceAssertions']=slice_total

# Historical links retain original locations. Check authored current links only.
documents=[ROOT/'README.md',ROOT/'CLAUDE.md']+list((ROOT/'docs').glob('*.md'))+list((ROOT/'docs/current').glob('*.md'))+[ROOT/'docs/history/README.md',ROOT/'docs/reference/README.md']
links=0
for document in documents:
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',document.read_text()):
        target=target.split('#',1)[0]
        if not target or re.match(r'^[a-z]+:',target):
            continue
        path=(document.parent/target).resolve()
        require(path.is_relative_to(ROOT) and path.exists(),f'Broken link in {document.name}: {target}')
        links+=1
checks['currentRelativeLinks']=links

generated=subprocess.run([sys.executable,str(ROOT/'scripts/build-documentation.py'),'--check'],cwd=ROOT,capture_output=True,text=True)
require(generated.returncode==0,generated.stdout+generated.stderr)
checks.update(read_json('docs/verification/generated-inventory.json'))
original=(history/'Health-AI-Wireframes-v1.0.html').read_text()
annotated=(ROOT/'docs/current/Health-AI-Wireframes-v1.1.html').read_text()
require(re.findall(r'<script>(.*?)</script>',original,re.S)==re.findall(r'<script>(.*?)</script>',annotated,re.S),'Prototype script changed')
require('R11 documentation review' in annotated and 'All 176 BRD acceptances remain pending' in annotated,'Wireframe boundary missing')
checks['prototypeScriptPreserved']=True
if errors:
    print('\n'.join(errors),file=sys.stderr)
    raise SystemExit(1)
print(json.dumps({'status':'passed','scope':'Documentation integrity against the current baseline ('+current_baseline+'); not product execution or formal acceptance',**checks},indent=2))
