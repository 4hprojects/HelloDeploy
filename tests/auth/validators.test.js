import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validatePasswordStrength,
  validateRegistration,
  validateSignIn,
  validateForgotPassword,
  validateNewPassword,
} from '../../apps/web/src/validators/auth.validator.js';

describe('validatePasswordStrength', () => {
  it('accepts a valid password', () => {
    assert.equal(validatePasswordStrength('ValidPass1').length, 0);
  });

  it('rejects too short', () => {
    assert.ok(validatePasswordStrength('Ab1').length > 0);
  });

  it('rejects missing uppercase', () => {
    assert.ok(validatePasswordStrength('validpass1').length > 0);
  });

  it('rejects missing lowercase', () => {
    assert.ok(validatePasswordStrength('VALIDPASS1').length > 0);
  });

  it('rejects missing digit', () => {
    assert.ok(validatePasswordStrength('ValidPassword').length > 0);
  });

  it('accepts symbols', () => {
    assert.equal(validatePasswordStrength('Valid@Pass1!').length, 0);
  });
});

describe('validateRegistration', () => {
  const valid = {
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    password: 'ValidPass1',
    confirmPassword: 'ValidPass1',
    acceptTerms: '1',
  };

  it('passes with valid data', () => {
    assert.ok(!validateRegistration(valid).hasErrors);
  });

  it('fails with missing firstName', () => {
    const { errors } = validateRegistration({ ...valid, firstName: '' });
    assert.ok(errors.firstName);
  });

  it('fails with invalid email', () => {
    const { errors } = validateRegistration({ ...valid, email: 'not-an-email' });
    assert.ok(errors.email);
  });

  it('fails when passwords do not match', () => {
    const { errors } = validateRegistration({ ...valid, confirmPassword: 'Different1' });
    assert.ok(errors.confirmPassword);
  });

  it('fails without terms acceptance', () => {
    const { errors } = validateRegistration({ ...valid, acceptTerms: undefined });
    assert.ok(errors.acceptTerms);
  });
});

describe('validateSignIn', () => {
  it('passes with valid credentials', () => {
    assert.ok(!validateSignIn({ email: 'a@b.com', password: 'x' }).hasErrors);
  });

  it('fails with missing email', () => {
    assert.ok(validateSignIn({ email: '', password: 'x' }).hasErrors);
  });

  it('fails with missing password', () => {
    assert.ok(validateSignIn({ email: 'a@b.com', password: '' }).hasErrors);
  });
});

describe('validateForgotPassword', () => {
  it('passes with valid email', () => {
    assert.ok(!validateForgotPassword({ email: 'a@b.com' }).hasErrors);
  });

  it('fails with invalid email', () => {
    assert.ok(validateForgotPassword({ email: 'bad' }).hasErrors);
  });
});

describe('validateNewPassword — uses same rules as registration', () => {
  it('passes with valid matching passwords', () => {
    assert.ok(
      !validateNewPassword({ password: 'NewPass1', confirmPassword: 'NewPass1' }).hasErrors,
    );
  });

  it('fails when confirmation does not match', () => {
    const { errors } = validateNewPassword({ password: 'NewPass1', confirmPassword: 'Other1' });
    assert.ok(errors.confirmPassword);
  });
});
