#!/usr/bin/env node
/**
 * Export the anonymized deployment study archive as NDJSON, one deployment
 * per line, for offline analysis. Run on the host from the release checkout
 * so it reads the production database configuration:
 *
 *   cd /opt/hellodeploy
 *   sudo node scripts/export-study-dataset.js --out ~/study.ndjson [--since 2026-10-01]
 */
import 'dotenv/config';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';

import { connectDatabase, disconnectDatabase, StudyDeployment } from '@hellodeploy/database';

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const outPath = argumentValue('--out');
const since = argumentValue('--since');
if (!outPath) {
  process.stderr.write(
    'Usage: node scripts/export-study-dataset.js --out <file.ndjson> [--since YYYY-MM-DD]\n',
  );
  process.exit(1);
}
const sinceDate = since ? new Date(`${since}T00:00:00Z`) : null;
if (sinceDate && Number.isNaN(sinceDate.getTime())) {
  process.stderr.write(`--since must be a date like 2026-10-01, got "${since}".\n`);
  process.exit(1);
}

await connectDatabase(process.env.MONGODB_URI);
const out = createWriteStream(outPath, { mode: 0o600 });
let count = 0;
try {
  const cursor = StudyDeployment.find(sinceDate ? { day: { $gte: sinceDate } } : {})
    .sort({ day: 1, _id: 1 })
    .select('-_id -__v')
    .lean()
    .cursor();
  for await (const row of cursor) {
    if (!out.write(`${JSON.stringify(row)}\n`)) {
      await once(out, 'drain');
    }
    count += 1;
  }
} finally {
  out.end();
  await once(out, 'finish');
  await disconnectDatabase();
}
process.stdout.write(`Exported ${count} deployment(s) to ${outPath}.\n`);
