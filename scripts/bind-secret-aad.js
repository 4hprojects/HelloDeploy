#!/usr/bin/env node
/**
 * Bind every stored environment secret to its own record.
 *
 * Without additional authenticated data a ciphertext decrypts wherever it is
 * placed, so anyone able to write to the collection could copy another project's
 * secret into a project they own and read the plaintext back through reveal or a
 * deploy. This re-encrypts each record with its projectId+name as AAD, which GCM
 * authenticates without storing.
 *
 * Reads are gated on each record's own `aadBound` flag, so this script and the
 * deploy that introduces it can happen in either order, with no downtime and no
 * window where a secret fails to decrypt.
 *
 * Idempotent: records already bound are not selected, so it is safe to re-run
 * after a partial failure.
 *
 * Usage:
 *   node scripts/bind-secret-aad.js
 */

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { connectDatabase, disconnectDatabase, EnvironmentSecret } from '@hellodeploy/database';
import { buildSecretAad, encrypt, decrypt } from '@hellodeploy/security';

const required = (name) => {
  const v = process.env[name];
  if (!v) {
    process.stderr.write(`Missing required env var: ${name}\n`);
    process.exit(1);
  }
  return v;
};

export async function bindAllSecrets() {
  const cursor = EnvironmentSecret.find({ aadBound: { $ne: true } }).cursor();

  let bound = 0;
  let failed = 0;

  for await (const secret of cursor) {
    try {
      // Unbound by selection, so this decrypt passes no AAD.
      const plaintext = decrypt({
        ciphertext: secret.ciphertext,
        iv: secret.iv,
        authTag: secret.authTag,
        version: secret.encryptionVersion,
      });

      const aad = buildSecretAad({ projectId: secret.projectId, name: secret.name });
      const reEncrypted = encrypt(plaintext, aad);
      if (!reEncrypted.aadBound) {
        throw new Error('Re-encryption did not bind the record.');
      }

      await EnvironmentSecret.updateOne(
        { _id: secret._id },
        {
          $set: {
            ciphertext: reEncrypted.ciphertext,
            iv: reEncrypted.iv,
            authTag: reEncrypted.authTag,
            encryptionVersion: reEncrypted.version,
            aadBound: true,
          },
        },
      );
      bound += 1;
    } catch (err) {
      failed += 1;
      process.stderr.write(`Failed to bind secret ${secret._id}: ${err.message}\n`);
    }
  }

  return { bound, failed };
}

async function main() {
  required('HELLODEPLOY_MASTER_KEY');
  await connectDatabase(required('MONGODB_URI'));

  try {
    const { bound, failed } = await bindAllSecrets();
    process.stdout.write(`bound=${bound} failed=${failed}\n`);
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
