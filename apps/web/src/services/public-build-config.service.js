import { EnvironmentSecret } from '@hellodeploy/database';
import { decrypt } from '@hellodeploy/security';
import { publicEnvironment } from '@hellodeploy/deployment-core';
export async function snapshotPublicEnvironment(projectId) {
  const rows = await EnvironmentSecret.find({ projectId, name: /^NEXT_PUBLIC_/ }).lean();
  return publicEnvironment(
    Object.fromEntries(
      rows.map((row) => [
        row.name,
        decrypt({
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.authTag,
          version: row.encryptionVersion,
        }),
      ]),
    ),
  );
}
