import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProjectStatus } from '@hellodeploy/contracts';
import { requireEditableProject } from '../../apps/web/src/middleware/require-editable-project.js';

function response() {
  return {
    location: null,
    redirect(location) {
      this.location = location;
      return this;
    },
  };
}

describe('archived project read-only guard', () => {
  it('allows active project mutations to continue', () => {
    let continued = false;
    const req = {
      project: { status: ProjectStatus.ACTIVE, slug: 'sample-app' },
      body: {},
    };

    requireEditableProject(req, response(), () => {
      continued = true;
    });

    assert.equal(continued, true);
  });

  it('blocks archived mutations and preserves a valid Settings return target', () => {
    let flash = null;
    let continued = false;
    const req = {
      project: { status: ProjectStatus.ARCHIVED, slug: 'sample-app' },
      body: { returnTo: '/projects/sample-app/settings#notifications' },
      flash(type, message) {
        flash = { type, message };
      },
    };
    const res = response();

    requireEditableProject(req, res, () => {
      continued = true;
    });

    assert.equal(continued, false);
    assert.equal(res.location, '/projects/sample-app/settings#notifications');
    assert.equal(flash.type, 'error');
    assert.match(flash.message, /read-only/);
  });

  it('falls back to the project overview for an unsafe return target', () => {
    const req = {
      project: { status: ProjectStatus.ARCHIVED, slug: 'sample-app' },
      body: { returnTo: 'https://attacker.example/settings' },
      flash() {},
    };
    const res = response();

    requireEditableProject(req, res, () => {});

    assert.equal(res.location, '/projects/sample-app');
  });
});
