import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { selectPublicBuildEnv } =
  await import('../../apps/worker/src/deployment/public-build-env.js');

describe('selectPublicBuildEnv', () => {
  it('keeps a value the framework compiles into the client bundle', () => {
    const selected = selectPublicBuildEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' });
    assert.deepEqual(selected, { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' });
  });

  it('drops a private value that would otherwise land in docker history', () => {
    const selected = selectPublicBuildEnv({ SUPABASE_SECRET_KEY: 'private' });
    assert.deepEqual(selected, {});
  });

  it('drops a name that merely contains a public prefix', () => {
    const selected = selectPublicBuildEnv({ APP_NEXT_PUBLIC_KEY: 'private' });
    assert.deepEqual(selected, {});
  });

  it('drops a name that does not match the environment variable grammar', () => {
    const selected = selectPublicBuildEnv({ 'NEXT_PUBLIC_A=B': 'injected' });
    assert.deepEqual(selected, {});
  });

  it('selects across every supported framework prefix', () => {
    const selected = selectPublicBuildEnv({
      NEXT_PUBLIC_A: '1',
      VITE_B: '2',
      REACT_APP_C: '3',
      VUE_APP_D: '4',
      DATABASE_URL: 'private',
    });
    assert.deepEqual(Object.keys(selected).sort(), [
      'NEXT_PUBLIC_A',
      'REACT_APP_C',
      'VITE_B',
      'VUE_APP_D',
    ]);
  });

  it('returns an empty selection when the project has no environment', () => {
    assert.deepEqual(selectPublicBuildEnv(undefined), {});
  });
});
