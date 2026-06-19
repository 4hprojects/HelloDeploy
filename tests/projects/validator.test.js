import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateCreateProject,
  validateUpdateProject,
  validateInviteMember,
} from '../../apps/web/src/validators/project.validator.js';

describe('validateCreateProject', () => {
  it('accepts a valid name', () => {
    assert.ok(!validateCreateProject({ name: 'My App' }).hasErrors);
  });

  it('rejects empty name', () => {
    const { errors } = validateCreateProject({ name: '' });
    assert.ok(errors.name);
  });

  it('rejects single character name', () => {
    const { errors } = validateCreateProject({ name: 'A' });
    assert.ok(errors.name);
  });

  it('rejects name over 100 characters', () => {
    const { errors } = validateCreateProject({ name: 'A'.repeat(101) });
    assert.ok(errors.name);
  });

  it('rejects name starting with a hyphen', () => {
    const { errors } = validateCreateProject({ name: '-bad-start' });
    assert.ok(errors.name);
  });

  it('accepts name starting with a digit', () => {
    assert.ok(!validateCreateProject({ name: '3d-renderer' }).hasErrors);
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
