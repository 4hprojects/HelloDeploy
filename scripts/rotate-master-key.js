#!/usr/bin/env node
/**
 * Re-encrypt every stored environment secret under the new master key during
 * a HELLODEPLOY_MASTER_KEY rotation.
 *
 * Prerequisites (see packages/security/src/encryption.js for the full flow):
 *   1. HELLODEPLOY_MASTER_KEY holds the current (old) key — unchanged.
 *   2. HELLODEPLOY_MASTER_KEY_NEXT holds the newly generated key.
 *   3. Both apps have been restarted with both vars set.
 *
 * This script decrypts every EnvironmentSecret still on version 1 (using the
 * primary key) and re-encrypts it (using the next key, via encrypt()'s
 * automatic rotation-window selection), bumping it to version 2. It is
 * idempotent — already-rotated (version 2) records are skipped, so it is
 * safe to re-run after a partial failure.
 *
 * Usage:
 *   node scripts/rotate-master-key.js
 *
 * After this completes with zero remaining version-1 records, promote the
 * next key: set HELLODEPLOY_MASTER_KEY to the value that was in
 * HELLODEPLOY_MASTER_KEY_NEXT, then unset HELLODEPLOY_MASTER_KEY_NEXT.
 */

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { connectDatabase, disconnectDatabase, EnvironmentSecret } from '@hellodeploy/database';
import { encrypt, decrypt, VERSION_PRIMARY, VERSION_NEXT } from '@hellodeploy/security';

const required = (name) => {
  const v = process.env[name];
  if (!v) {
    process.stderr.write(`Missing required env var: ${name}\n`);
    process.exit(1);
  }
  return v;
};

export async function rotateAllSecrets() {
  const cursor = EnvironmentSecret.find({ encryptionVersion: VERSION_PRIMARY }).cursor();

  let rotated = 0;
  let failed = 0;

  for await (const secret of cursor) {
    try {
      const plaintext = decrypt({
        ciphertext: secret.ciphertext,
        iv: secret.iv,
        authTag: secret.authTag,
        version: secret.encryptionVersion,
      });
      const reEncrypted = encrypt(plaintext);
      if (reEncrypted.version !== VERSION_NEXT) {
        throw new Error('HELLODEPLOY_MASTER_KEY_NEXT is not set — nothing to rotate to.');
      }
      await EnvironmentSecret.updateOne(
        { _id: secret._id },
        {
          $set: {
            ciphertext: reEncrypted.ciphertext,
            iv: reEncrypted.iv,
            authTag: reEncrypted.authTag,
            encryptionVersion: reEncrypted.version,
          },
        },
      );
      rotated += 1;
    } catch (err) {
      failed += 1;
      process.stderr.write(`Failed to rotate secret ${secret._id}: ${err.message}\n`);
    }
  }

  return { rotated, failed };
}

async function main() {
  required('HELLODEPLOY_MASTER_KEY');
  required('HELLODEPLOY_MASTER_KEY_NEXT');
  await connectDatabase(required('MONGODB_URI'));

  try {
    const { rotated, failed } = await rotateAllSecrets();
    process.stdout.write(`rotated=${rotated} failed=${failed}\n`);
    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
