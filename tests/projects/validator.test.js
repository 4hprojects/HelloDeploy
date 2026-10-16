import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateCreateProject,
  validateUpdateProject,
  validateInviteMember,
  validateUpdateBuildConfiguration,
} from '../../apps/web/src/validators/project.validator.js';

describe('validateCreateProject', () => {
  it('accepts a valid name', () => {
    assert.ok(!validateCreateProject({ name: 'My App', slug: 'my-app' }).hasErrors);
  });

  it('rejects empty name', () => {
    const { errors } = validateCreateProject({ name: '', slug: 'my-app' });
    assert.ok(errors.name);
  });

  it('rejects single character name', () => {
    const { errors } = validateCreateProject({ name: 'A', slug: 'a-app' });
    assert.ok(errors.name);
  });

  it('rejects name over 100 characters', () => {
    const { errors } = validateCreateProject({ name: 'A'.repeat(101), slug: 'my-app' });
    assert.ok(errors.name);
  });

  it('rejects name starting with a hyphen', () => {
    const { errors } = validateCreateProject({ name: '-bad-start', slug: 'bad-start' });
    assert.ok(errors.name);
  });

  it('accepts name starting with a digit', () => {
    assert.ok(!validateCreateProject({ name: '3d-renderer', slug: '3d-renderer' }).hasErrors);
  });
});

describe('validateUpdateProject', () => {
  it('accepts a valid name', () => {
    assert.ok(!validateUpdateProject({ name: 'Updated Name' }).hasErrors);
  });

  it('rejects empty name', () => {
    const { errors } = validateUpdateProject({ name: '' });
    assert.ok(errors.name);
  });

  it('rejects name over 100 characters', () => {
    const { errors } = validateUpdateProject({ name: 'B'.repeat(101) });
    assert.ok(errors.name);
  });
});

describe('validateInviteMember', () => {
  it('accepts valid email and role', () => {
    assert.ok(!validateInviteMember({ email: 'alice@example.com', role: 'MAINTAINER' }).hasErrors);
  });

  it('accepts VIEWER role', () => {
    assert.ok(!validateInviteMember({ email: 'bob@example.com', role: 'VIEWER' }).hasErrors);
  });

  it('rejects missing email', () => {
    const { errors } = validateInviteMember({ email: '', role: 'MAINTAINER' });
    assert.ok(errors.email);
  });

  it('rejects invalid email format', () => {
    const { errors } = validateInviteMember({ email: 'notanemail', role: 'MAINTAINER' });
    assert.ok(errors.email);
  });

  it('rejects missing role', () => {
    const { errors } = validateInviteMember({ email: 'a@b.com', role: '' });
    assert.ok(errors.role);
  });

  it('rejects OWNER as invite role', () => {
    const { errors } = validateInviteMember({ email: 'a@b.com', role: 'OWNER' });
    assert.ok(errors.role);
  });
});

describe('validateUpdateBuildConfiguration — Python strategies', () => {
  it('accepts a Python strategy with a module:attribute entry point', () => {
    const { hasErrors } = validateUpdateBuildConfiguration({
      buildStrategy: 'python_fastapi_v1',
      applicationModule: 'main:app',
    });
    assert.equal(hasErrors, false);
  });

  it('requires the application module for a Python strategy', () => {
    const { errors } = validateUpdateBuildConfiguration({ buildStrategy: 'python_django_v1' });
    assert.match(errors.applicationModule, /required/);
  });

  it('does not ask a legacy project for an application module', () => {
    const { errors } = validateUpdateBuildConfiguration({ buildStrategy: 'legacy_generated' });
    assert.equal(errors.applicationModule, undefined);
  });
});

describe('validateUpdateBuildConfiguration — PHP strategies', () => {
  it('accepts a plain PHP site served from the repository root', () => {
    const { hasErrors } = validateUpdateBuildConfiguration({
      buildStrategy: 'php_plain_v1',
      outputDirectory: '.',
    });
    assert.equal(hasErrors, false);
  });

  it('rejects a document root outside the two layouts', () => {
    const { errors } = validateUpdateBuildConfiguration({
      buildStrategy: 'php_plain_v1',
      outputDirectory: 'web',
    });
    assert.match(errors.outputDirectory, /\. or public/);
  });

  it('requires Laravel to serve the public folder', () => {
    const { errors } = validateUpdateBuildConfiguration({
      buildStrategy: 'php_laravel_v1',
      outputDirectory: '.',
    });
    assert.match(errors.outputDirectory, /public folder/);
  });
});
