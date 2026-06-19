// Password rules are identical on registration and reset forms (blueprint requirement).
const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: /[A-Z]/,
  requireLowercase: /[a-z]/,
  requireDigit: /[0-9]/,
};

export function validatePasswordStrength(password) {
  const errors = [];
  if (!password || password.length < PASSWORD_RULES.minLength) {
    errors.push(`Password must be at least ${PASSWORD_RULES.minLength} characters.`);
  }
  if (password && password.length > PASSWORD_RULES.maxLength) {
    errors.push(`Password must not exceed ${PASSWORD_RULES.maxLength} characters.`);
  }
  if (password && !PASSWORD_RULES.requireUppercase.test(password)) {
    errors.push('Password must contain at least one uppercase letter.');
  }
  if (password && !PASSWORD_RULES.requireLowercase.test(password)) {
    errors.push('Password must contain at least one lowercase letter.');
  }
  if (password && !PASSWORD_RULES.requireDigit.test(password)) {
    errors.push('Password must contain at least one number.');
  }
  return errors;
}

/**
 * Validate registration form inputs.
 * @returns {{ errors: Record<string, string>, hasErrors: boolean }}
 */
export function validateRegistration(body) {
  const errors = {};

  const firstName = (body.firstName ?? '').trim();
  const lastName = (body.lastName ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const { password, confirmPassword } = body;

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

  if (!email) {
    errors.email = 'Email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.';
  } else if (email.length > 254) {
    errors.email = 'Email address is too long.';
  }

  const passwordErrors = validatePasswordStrength(password);
  if (passwordErrors.length > 0) {
    errors.password = passwordErrors[0];
  }

  if (!confirmPassword) {
    errors.confirmPassword = 'Please confirm your password.';
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  if (!body.acceptTerms) {
    errors.acceptTerms = 'You must accept the Terms, Privacy Policy, and Acceptable Use Policy.';
  }

  return { errors, hasErrors: Object.keys(errors).length > 0 };
}

/**
 * Validate sign-in form inputs.
 */
export function validateSignIn(body) {
  const errors = {};
  const email = (body.email ?? '').trim().toLowerCase();

  if (!email) {
    errors.email = 'Email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!body.password) {
    errors.password = 'Password is required.';
  }

  return { errors, hasErrors: Object.keys(errors).length > 0 };
}

/**
 * Validate forgot-password email submission.
 */
export function validateForgotPassword(body) {
  const errors = {};
  const email = (body.email ?? '').trim().toLowerCase();

  if (!email) {
    errors.email = 'Email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  return { errors, hasErrors: Object.keys(errors).length > 0 };
}

/**
 * Validate password reset code (step 2 of recovery).
 */
export function validateResetCode(body) {
  const errors = {};
  if (!body.code || (body.code ?? '').trim().length === 0) {
    errors.code = 'Reset code is required.';
  }
  return { errors, hasErrors: Object.keys(errors).length > 0 };
}

/**
 * Validate new password submission (step 3 of recovery).
 * Uses same rules as registration (blueprint requirement).
 */
export function validateNewPassword(body) {
  const errors = {};

  const passwordErrors = validatePasswordStrength(body.password);
  if (passwordErrors.length > 0) {
    errors.password = passwordErrors[0];
  }

  if (!body.confirmPassword) {
    errors.confirmPassword = 'Please confirm your new password.';
  } else if (body.password !== body.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return { errors, hasErrors: Object.keys(errors).length > 0 };
}
