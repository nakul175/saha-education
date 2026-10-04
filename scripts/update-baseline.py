#!/usr/bin/env python3
"""Record a new application source baseline after a development slice.

Earlier baselines (for example application-r11-sha256.json) stay as historical evidence and are
never rewritten. The new manifest covers the files of the previous current baseline that still
exist plus any tracked runtime, migration, test or script files added since, and
docs/verification/current-baseline.json is pointed at it. check-documentation.py verifies the
current baseline only.

Usage: python3 scripts/update-baseline.py <slug> "<label>"
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT / 'docs/verification'
RUNTIME = ('app/', 'lib/', 'db/', 'drizzle/', 'public/', 'scripts/', 'tests/', 'components/', 'hooks/', 'build/', 'vendor/', 'examples/')

slug, label = sys.argv[1], sys.argv[2]
pointer = VERIFY / 'current-baseline.json'
previous = json.loads(pointer.read_text())['manifest'] if pointer.exists() else 'application-r11-sha256.json'
files = set(json.loads((VERIFY / previous).read_text())['files'])
tracked = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
files |= {f for f in tracked if f.startswith(RUNTIME) and not f.startswith('tests/evidence/')}
files = sorted(f for f in files if (ROOT / f).is_file())
manifest = {
    'baseline': label,
    'previous': previous,
    'note': 'Source digests at the end of this development slice. Historical baselines are retained unchanged.',
    'files': {f: hashlib.sha256((ROOT / f).read_bytes()).hexdigest() for f in files},
}
name = f'application-{slug}-sha256.json'
(VERIFY / name).write_text(json.dumps(manifest, indent=2) + '\n')
pointer.write_text(json.dumps({'manifest': name, 'label': label}, indent=2) + '\n')
print(json.dumps({'manifest': name, 'files': len(files), 'previous': previous}))
