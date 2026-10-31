import { validatePasswordStrength } from './auth.validator.js';

export function validateProfile(body) {
  const errors = {};
  const firstName = (body.firstName ?? '').trim();
  const lastName = (body.lastName ?? '').trim();

  if (!firstName) {
    errors.firstName = 'First name is required.';
  } else if (firstName.length > 100) {
    errors.firstName = 'First name must not exceed 100 characters.';
  }

  if (!lastName) {
    errors.lastName = 'Last name is required.';
  } else if (lastName.length > 100) {
    errors.lastName = 'Last name must not exceed 100 characters.';
  }

  return { errors, hasErrors: Object.keys(errors).length > 0, values: { firstName, lastName } };
}

export function validatePasswordChange(body) {
  const errors = {};

  if (!body.currentPassword) {
    errors.currentPassword = 'Enter your current password.';
  }

  const passwordErrors = validatePasswordStrength(body.password);
  if (passwordErrors.length > 0) {
    errors.password = passwordErrors[0];
  } else if (body.password === body.currentPassword) {
    errors.password = 'Choose a password different from your current one.';
  }

  if (!body.confirmPassword) {
    errors.confirmPassword = 'Please confirm your new password.';
  } else if (body.password !== body.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return { errors, hasErrors: Object.keys(errors).length > 0 };
}
