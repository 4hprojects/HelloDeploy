import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const routesSource = await readFile(
  new URL('../../apps/web/src/routes/pages/project.routes.js', import.meta.url),
  'utf8',
);

/**
 * Asserted against the source rather than the router: importing the routes module
 * opens the rate limiter's Redis connection, which never settles under the test
 * runner. Same approach as the trust-proxy check in tests/security/csrf.test.js.
 *
 * The deploy budget is per project. A limiter placed ahead of the role guard lets
 * someone with no role on the project spend it, which is a denial of service
 * against the owner's ability to deploy.
 */
describe('deploy rate limiting runs after the project role guard', () => {
  /**
   * The middleware list of the `router.post` registration for `routePath`. Scoped
   * to POST because the same path is also registered for GET with a different
   * guard, and matching the path alone would read the wrong route.
   */
  function handlerOrder(routePath) {
    const registration = new RegExp(
      `router\\.post\\(\\s*'${routePath.replace(/[/:]/g, '\\$&')}',([^;]*?)\\);`,
    );
    const match = routesSource.match(registration);
    assert.ok(match, `POST ${routePath} not found`);
    return {
      roleGuard: match[1].indexOf('ownerOrMaintainer'),
      limiter: match[1].indexOf('deployActionLimiter'),
    };
  }

  it('guards the role before the limiter when creating a deployment', () => {
    const { roleGuard, limiter } = handlerOrder('/:slug/deployments');

    assert.ok(roleGuard > 0 && roleGuard < limiter);
  });

  it('guards the role before the limiter when rolling back', () => {
    const { roleGuard, limiter } = handlerOrder('/:slug/rollback');

    assert.ok(roleGuard > 0 && roleGuard < limiter);
  });
});
