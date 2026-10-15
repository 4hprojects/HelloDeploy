#!/usr/bin/env node
/**
 * Export an anonymized study archive as NDJSON, one row per line, for offline
 * analysis: deployments (the default) or project audit events. Run on the host
 * from the release checkout so it reads the production database configuration:
 *
 *   cd /opt/hellodeploy
 *   sudo node scripts/export-study-dataset.js --out ~/study.ndjson [--since 2026-10-01] [--dataset audit]
 */
import 'dotenv/config';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';

import {
  connectDatabase,
  disconnectDatabase,
  StudyAuditEvent,
  StudyDeployment,
} from '@hellodeploy/database';

const DATASETS = {
  deployments: { model: StudyDeployment, noun: 'deployment(s)' },
  audit: { model: StudyAuditEvent, noun: 'audit event(s)' },
};

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const outPath = argumentValue('--out');
const since = argumentValue('--since');
const datasetName = argumentValue('--dataset') ?? 'deployments';
const dataset = Object.hasOwn(DATASETS, datasetName) ? DATASETS[datasetName] : null;
if (!outPath || !dataset) {
  process.stderr.write(
    'Usage: node scripts/export-study-dataset.js --out <file.ndjson> [--since YYYY-MM-DD] [--dataset deployments|audit]\n',
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
  const cursor = dataset.model
    .find(sinceDate ? { day: { $gte: sinceDate } } : {})
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
process.stdout.write(`Exported ${count} ${dataset.noun} to ${outPath}.\n`);
