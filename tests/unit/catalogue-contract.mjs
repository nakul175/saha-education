// NFR-09: count the current specification; source links never become acceptance.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCatalogue, summariseCatalogue } from '../../scripts/test-catalogue.mjs';
const root = mkdtempSync(join(tmpdir(), 'saha-catalogue-'));
let passed = 0;
function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  passed++;
}
try {
  mkdirSync(join(root, 'tests/unit'), { recursive: true });
  mkdirSync(join(root, 'docs/specification'), { recursive: true });
  // These files are catalogue input fixtures, never executed as test evidence.
  writeFileSync(join(root, 'tests/unit/example-contract.mjs'), '// catalogue fixture\n');
  writeFileSync(join(root, 'tests/unit/unlinked-contract.mjs'), '// catalogue fixture\n');
  writeFileSync(
    join(root, 'docs/specification/requirements.json'),
    JSON.stringify({ requirements: [{ id: 'FR-01' }, { id: 'NFR-09' }] }),
  );
  writeFileSync(
    join(root, 'docs/specification/TEST-CASES.json'),
    JSON.stringify({
      cases: [
        {
          requirements: ['FR-01', 'NFR-09'],
          evidenceFiles: ['tests/unit/example-contract.mjs'],
          execution_status: 'not-run-for-this-specification',
        },
        {
          requirements: ['NFR-09'],
          evidenceFiles: ['tests/unit/example-contract.mjs'],
          execution_status: 'not-run-for-this-specification',
        },
      ],
    }),
  );
  const catalogue = buildCatalogue(root),
    summary = summariseCatalogue(catalogue);
  check(catalogue.errors, [], 'Fixture tests are classified');
  check(summary.requirementCount, 2, 'Count comes from canonical requirement register');
  check(
    catalogue.suites.find((row) => row.file.endsWith('example-contract.mjs')).requirements,
    ['FR-01', 'NFR-09'],
    'Duplicate evidence links deduplicated',
  );
  check(summary.requirementsCitedBySomeTest, 2, 'Runnable-file references counted');
  check(summary.suitesCitingNoRequirement, 1, 'Unlinked suite remains visible');
  check(Object.hasOwn(summary, 'accepted'), false, 'Link summary does not grant acceptance');
  writeFileSync(join(root, 'docs/specification/TEST-CASES.json'), '{broken');
  check(buildCatalogue(root).errors.length, 1, 'Malformed mapping fails classification check');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0 }));
} finally {
  rmSync(root, { recursive: true, force: true });
}
