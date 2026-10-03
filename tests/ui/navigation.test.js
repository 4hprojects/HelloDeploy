import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationFor } from '../../apps/web/src/config/navigation.js';

test('public and application navigation preserve real routes and exclude primary Status', () => {
  const publicItems = navigationFor(null, '/docs/domains');
  assert.deepEqual(
    publicItems.map((item) => item.label),
    ['Product', 'How It Works', 'Docs', 'Supported Apps', 'Sign In', 'Create Account'],
  );
  assert.deepEqual(
    publicItems.filter((item) => item.active).map((item) => item.label),
    ['Docs'],
  );
  const appItems = navigationFor({ platformRole: 'USER' }, '/projects/example/settings');
  assert.deepEqual(
    appItems.map((item) => item.label),
    ['Dashboard', 'Projects', 'Docs'],
  );
  assert.deepEqual(
    appItems.filter((item) => item.active).map((item) => item.label),
    ['Projects'],
  );
  assert.equal(
    navigationFor(null, '/').some((item) => item.active),
    false,
  );
});
