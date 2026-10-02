#!/usr/bin/env node

import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const FULL_SHA = /^[0-9a-f]{40}$/;
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, values) => {
    if (value.startsWith('--') && values[index + 1] && !values[index + 1].startsWith('--')) {
      pairs.push([value.slice(2), values[index + 1]]);
    }
    return pairs;
  }, []),
);

const output = args.output ?? '/var/lib/hellodeploy/platform-release.json';
const actualSha = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const expectedSha = (args.expected ?? actualSha).trim().toLowerCase();

if (!FULL_SHA.test(actualSha) || !FULL_SHA.test(expectedSha)) {
  throw new Error('Release metadata requires full 40-character commit SHAs.');
}

const metadata = {
  schemaVersion: 1,
  actualSha,
  expectedSha,
  matchesExpected: actualSha === expectedSha,
  installedAt: new Date().toISOString(),
};
if (args.previous && FULL_SHA.test(args.previous)) {
  metadata.previousSha = args.previous;
}

await mkdir(dirname(output), { recursive: true, mode: 0o750 });
const temporary = `${output}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o640 });
await rename(temporary, output);
process.stdout.write(`Release metadata written for ${actualSha}.\n`);
