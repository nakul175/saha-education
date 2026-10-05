#!/usr/bin/env python3
"""Check this documentation set's local links and immutable baseline references."""
from pathlib import Path
import re
import json
import sys
root = Path(__file__).resolve().parents[1]
docs = root / 'docs/education'
register = json.loads((docs / 'requirements.json').read_text())
errors = []
files = [root / 'README.md', root / 'HANDOVER.md', root / 'VALIDATION.md', *sorted(docs.glob('*.md')), *sorted((root / 'docs/current').glob('*.md')), *sorted((root / 'docs/specification').rglob('*.md'))]
for file in files:
    text = file.read_text()
    if not text.startswith('# '):
        errors.append(f'{file.relative_to(root)}: missing title')
    if file.parent == docs and register['baseline'] not in text:
        errors.append(f'{file.name}: missing source baseline')
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):
            continue
        path = (file.parent / target.split('#')[0]).resolve()
        if not path.is_relative_to(root) or not path.exists():
            errors.append(f'{file.relative_to(root)}: broken local link {target}')
    if text.count('```') % 2:
        errors.append(f'{file.name}: unmatched code fence')
if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f'Documentation check passed: {len(files)} Markdown files, local links and baseline references.')
