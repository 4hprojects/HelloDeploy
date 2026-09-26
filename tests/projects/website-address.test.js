import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import { readFile } from 'node:fs/promises';

import { Project } from '@hellodeploy/database';
import { ProjectStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { checkAddressAvailability, toAddressLabel, ADDRESS_STATUS } =
  await import('../../apps/web/src/services/website-address.service.js');

async function createProject(overrides = {}) {
  return Project.create({
    name: 'Taken',
    slug: 'taken-site',
    ownerId: objectId(),
    status: ProjectStatus.DRAFT,
    platformSubdomain: 'taken-site',
    ...overrides,
  });
}

describe('website address suggestion', () => {
  it('turns a project name into an address', () => {
    assert.equal(toAddressLabel('Hello University'), 'hello-university');
  });

  it('drops characters that cannot appear in an address', () => {
    assert.equal(toAddressLabel('My App!! v2'), 'my-app-v2');
  });

  it('does not leave a trailing hyphen', () => {
    assert.equal(toAddressLabel('Trailing -- '), 'trailing');
  });

  it('keeps an address within one DNS label', () => {
    assert.equal(toAddressLabel('a'.repeat(120)).length, 63);
  });
});

describe('website address availability', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('accepts an unused address', async () => {
    const result = await checkAddressAvailability('hellouniversity');
    assert.equal(result.status, ADDRESS_STATUS.AVAILABLE);
  });

  it('refuses an address another website already uses', async () => {
    await createProject();
    const result = await checkAddressAvailability('taken-site');

    assert.equal(result.status, ADDRESS_STATUS.TAKEN);
  });

  it('lets a project keep its own address', async () => {
    const existing = await createProject();
    const result = await checkAddressAvailability('taken-site', {
      excludeProjectId: existing._id,
    });

    assert.equal(result.status, ADDRESS_STATUS.AVAILABLE);
  });

  it('refuses an address that clashes with another slug', async () => {
    await createProject({ slug: 'other-slug', platformSubdomain: 'something-else' });
    const result = await checkAddressAvailability('other-slug');

    assert.equal(result.status, ADDRESS_STATUS.TAKEN);
  });

  it('refuses a name the platform keeps for itself', async () => {
    const result = await checkAddressAvailability('admin');
    assert.equal(result.status, ADDRESS_STATUS.RESERVED);
  });

  it('refuses an address with characters DNS cannot carry', async () => {
    const result = await checkAddressAvailability('My App!');
    assert.equal(result.status, ADDRESS_STATUS.INVALID);
  });

  it('refuses an address starting with a hyphen', async () => {
    const result = await checkAddressAvailability('-lead');
    assert.equal(result.status, ADDRESS_STATUS.INVALID);
  });

  it('asks for an address when the field is empty', async () => {
    const result = await checkAddressAvailability('   ');
    assert.equal(result.status, ADDRESS_STATUS.EMPTY);
  });

  it('explains what a valid address looks like', async () => {
    const result = await checkAddressAvailability('My App!');
    assert.match(result.message, /lowercase letters, numbers and hyphens/);
  });

  it('agrees with the rule the worker enforces when routing', async () => {
    // A reserved address must never reach the worker, which fails the whole
    // deployment with SUBDOMAIN_INVALID.
    const { isReservedSubdomain } = await import('@hellodeploy/contracts');
    const result = await checkAddressAvailability('www');

    assert.equal(result.isAvailable, !isReservedSubdomain('www'));
  });
});

describe('website address route wiring', () => {
  it('registers the availability check before the catch-all step route', async () => {
    const routes = await readFile(
      new URL('../../apps/web/src/routes/pages/project.routes.js', import.meta.url),
      'utf8',
    );

    // Express matches in order: if the :step wildcard came first it would
    // swallow this endpoint and the field would never report availability.
    assert.ok(
      routes.indexOf("'/:slug/setup/address-available'") < routes.indexOf("'/:slug/setup/:step'"),
    );
  });
});
