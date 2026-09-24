import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  publicEnvironment,
  publicConfigurationFingerprint,
  releaseEnvironment,
} from '@hellodeploy/deployment-core';
import { generateDockerfile } from '../../apps/worker/src/deployment/dockerfile-generator.js';
it('exports only public values and fingerprints deterministically', () => {
  const values = {
    NEXT_PUBLIC_APP_URL: 'https://example.test',
    SUPABASE_SECRET_KEY: 'private',
    DATABASE_URL: 'private',
  };
  assert.deepEqual(publicEnvironment(values), { NEXT_PUBLIC_APP_URL: values.NEXT_PUBLIC_APP_URL });
  assert.equal(
    publicConfigurationFingerprint(values),
    publicConfigurationFingerprint({ NEXT_PUBLIC_APP_URL: values.NEXT_PUBLIC_APP_URL }),
  );
  assert.notEqual(
    publicConfigurationFingerprint(values),
    publicConfigurationFingerprint({ NEXT_PUBLIC_APP_URL: 'https://other.test' }),
  );
});
it('rejects malformed names, control characters, and privileged Supabase keys', () => {
  for (const values of [
    { 'NEXT_PUBLIC_BAD\nRUN': 'x' },
    { NEXT_PUBLIC_X: 'bad\nvalue' },
    { NEXT_PUBLIC_X: 'sb_secret_private' },
    { NEXT_PUBLIC_X: `x.${Buffer.from('{"role":"service_role"}').toString('base64url')}.x` },
  ]) {
    assert.throws(() => publicEnvironment(values));
  }
});
it('restores public snapshot while using current runtime secrets', () => {
  assert.deepEqual(
    releaseEnvironment(
      { NEXT_PUBLIC_NEW: 'changed', NEXT_PUBLIC_APP_URL: 'new', SUPABASE_SECRET_KEY: 'rotated' },
      { NEXT_PUBLIC_APP_URL: 'old' },
    ),
    { NEXT_PUBLIC_APP_URL: 'old', SUPABASE_SECRET_KEY: 'rotated' },
  );
});
it('generates declarations without values and binds the standalone server', () => {
  const dockerfile = generateDockerfile({
    runtimeType: 'NEXTJS',
    publicBuildEnvironment: {
      NEXT_PUBLIC_LABEL: 'browser-build-value-sentinel',
      SUPABASE_SECRET_KEY: 'secret',
    },
  });
  assert.match(dockerfile, /ARG NEXT_PUBLIC_LABEL/);
  assert.match(dockerfile, /ENV HOSTNAME=0.0.0.0/);
  assert.ok(!dockerfile.includes('browser-build-value-sentinel'));
  assert.ok(!dockerfile.includes('SUPABASE_SECRET_KEY'));
});

it('limits build networking to dependency installation', () => {
  const dockerfile = generateDockerfile({ runtimeType: 'NEXTJS' });
  assert.match(dockerfile, /RUN --network=default npm ci/);
  assert.match(dockerfile, /RUN --network=none npm run build/);
});
