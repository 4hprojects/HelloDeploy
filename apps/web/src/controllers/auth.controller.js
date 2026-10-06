import { asyncHandler } from '../utils/async-handler.js';
import { isSafeReturnPath } from '../utils/safe-redirect.js';
import { AuditOutcome, PlatformRole } from '@hellodeploy/contracts';
import { logger, writeAuditEvent } from '@hellodeploy/observability';
import { generateRawToken } from '@hellodeploy/security';
import { env } from '../config/env.js';
import {
  registerUser,
  verifyEmail,
  resendVerificationEmail,
  signIn,
  initiatePasswordReset,
  verifyPasswordResetCode,
  completePasswordReset,
} from '../services/auth.service.js';
import {
  completeGoogleAccount,
  createGoogleAuthorization,
  exchangeGoogleCode,
  linkGoogleAccount,
  resolveGoogleIdentity,
  verifyGoogleReauthentication,
} from '../services/google-auth.service.js';
import {
  validateRegistration,
  validateSignIn,
  validateForgotPassword,
  validateResetCode,
  validateNewPassword,
  validateGoogleAccountCompletion,
} from '../validators/auth.validator.js';
import { recordProductEvent } from '../services/product-analytics.service.js';
import { verifyTurnstile as verifyTurnstileToken } from '../services/turnstile.service.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const GOOGLE_FLOW_TTL_MS = 10 * 60 * 1000;

function authRenderOpts(extra = {}) {
  return { layout: 'layouts/auth', ...extra };
}

function pendingGoogleIdentity(req) {
  const pending = req.session?.pendingGoogleIdentity;
  if (!pending || pending.expiresAt <= Date.now()) {
    if (req.session) {
      delete req.session.pendingGoogleIdentity;
    }
    return null;
  }
  return pending.identity;
}

function establishSession(req, res, sessionUser, returnTo, message) {
  req.session.regenerate((err) => {
    if (err) {
      return res.redirect('/auth/sign-in?error=session');
    }
    req.session.user = sessionUser;
    req.session.authenticatedAt = Date.now();
    if (message) {
      req.flash('success', message);
    }
    req.session.save(() => res.redirect(returnTo || redirectByRole(sessionUser.platformRole)));
  });
}

function safeRedirect(req, fallback) {
  const returnTo = req.query.returnTo ?? req.body.returnTo ?? '';
  return isSafeReturnPath(returnTo) ? returnTo : fallback;
}

function redirectByRole(role) {
  if (role === PlatformRole.SUPER_ADMIN || role === PlatformRole.ADMIN) {
    return '/admin';
  }
  return '/dashboard';
}

function maskEmail(value) {
  if (typeof value !== 'string' || !value.includes('@')) {
    return null;
  }
  const [local, domain] = value.split('@');
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}

function verificationRender(req, extra = {}) {
  const email = req.session?.pendingVerificationEmail ?? null;
  return authRenderOpts({
    title: 'Verify Email',
    maskedEmail: maskEmail(email),
    verificationEmail: email,
    resendAvailableAt: req.session?.verificationResendAvailableAt ?? null,
    ...extra,
  });
}

// ─── Create Account ────────────────────────────────────────────────────────────

export function getCreateAccount(req, res) {
  if (req.session?.user) {
    return res.redirect(redirectByRole(req.session.user.platformRole));
  }
  recordProductEvent({ name: 'signup_started' });
  res.render('pages/auth/create-account', authRenderOpts({ title: 'Create Account' }));
}

export const postCreateAccount = asyncHandler(async (req, res) => {
  const { errors, hasErrors } = validateRegistration(req.body);

  if (hasErrors) {
    return res.render(
      'pages/auth/create-account',
      authRenderOpts({
        title: 'Create Account',
        errors,
        values: {
          firstName: req.body.firstName ?? '',
          lastName: req.body.lastName ?? '',
          email: req.body.email ?? '',
        },
      }),
    );
  }

  // Honeypot check — bots fill this hidden field
  if (req.body.website) {
    return res.redirect('/auth/create-account?submitted=1');
  }

  const turnstileOk = await verifyTurnstileToken({
    token: req.body['cf-turnstile-response'],
    sourceIp: req.ip,
    expectedAction: 'create-account',
  });
  if (!turnstileOk) {
    return res.render(
      'pages/auth/create-account',
      authRenderOpts({
        title: 'Create Account',
        errors: { form: 'Bot protection check failed. Please try again.' },
        values: {
          firstName: req.body.firstName ?? '',
          lastName: req.body.lastName ?? '',
          email: req.body.email ?? '',
        },
      }),
    );
  }

  const registration = await registerUser({
    firstName: req.body.firstName.trim(),
    lastName: req.body.lastName.trim(),
    email: req.body.email.trim().toLowerCase(),
    password: req.body.password,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (registration?.user?.email) {
    req.session.pendingVerificationEmail = registration.user.email;
  }

  // Always show "check your email" — never confirm or deny whether email exists
  res.redirect('/auth/verify-email?submitted=1');
});

// ─── Verify Email ──────────────────────────────────────────────────────────────

export const getVerifyEmail = asyncHandler(async (req, res) => {
  const { token, submitted, resent, rateLimited } = req.query;

  if (submitted) {
    return res.render('pages/auth/verify-email', verificationRender(req, { submitted: true }));
  }

  if (resent) {
    return res.render('pages/auth/verify-email', verificationRender(req, { resent: true }));
  }

  if (rateLimited) {
    return res.render('pages/auth/verify-email', verificationRender(req, { rateLimited: true }));
  }

  if (!token) {
    return res.render('pages/auth/verify-email', verificationRender(req));
  }

  const result = await verifyEmail({
    rawToken: token,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return res.render('pages/auth/verify-email', verificationRender(req, { error: result.error }));
  }

  // Session fixation protection — regenerate session ID after auth, same as sign-in
  const sessionUser = result.sessionUser;
  req.session.regenerate((err) => {
    if (err) {
      return res.redirect('/auth/sign-in');
    }
    req.session.user = sessionUser;
    req.flash('success', 'Email verified. Welcome to HelloDeploy!');
    req.session.save(() => {
      res.redirect(redirectByRole(sessionUser.platformRole));
    });
  });
});

export const postResendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (email) {
    await resendVerificationEmail({
      email: email.trim().toLowerCase(),
      sourceIp: req.ip,
      correlationId: req.correlationId,
    });
  }

  req.session.pendingVerificationEmail =
    email?.trim().toLowerCase() || req.session.pendingVerificationEmail;
  req.session.verificationResendAvailableAt = Date.now() + 60_000;

  res.redirect('/auth/verify-email?resent=1');
});

// ─── Sign In ───────────────────────────────────────────────────────────────────

export function getSignIn(req, res) {
  if (req.session?.user) {
    return res.redirect(redirectByRole(req.session.user.platformRole));
  }
  const flashSuccess = res.locals.flash?.success ?? null;
  const flashError = res.locals.flash?.error ?? null;
  const returnTo = isSafeReturnPath(req.query.returnTo) ? req.query.returnTo : '';
  res.render(
    'pages/auth/sign-in',
    authRenderOpts({
      title: 'Sign In',
      success: flashSuccess,
      returnTo,
      errors: flashError ? { form: flashError } : {},
    }),
  );
}

export const postSignIn = asyncHandler(async (req, res) => {
  const { errors, hasErrors } = validateSignIn(req.body);
  const returnTo = isSafeReturnPath(req.body.returnTo) ? req.body.returnTo : '';

  if (hasErrors) {
    return res.render(
      'pages/auth/sign-in',
      authRenderOpts({
        title: 'Sign In',
        errors,
        values: { email: req.body.email ?? '' },
        returnTo,
      }),
    );
  }

  const turnstileOk = await verifyTurnstileToken({
    token: req.body['cf-turnstile-response'],
    sourceIp: req.ip,
    expectedAction: 'sign-in',
  });
  if (!turnstileOk) {
    return res.render(
      'pages/auth/sign-in',
      authRenderOpts({
        title: 'Sign In',
        errors: { form: 'Bot protection check failed. Please try again.' },
        values: { email: req.body.email ?? '' },
        returnTo,
      }),
    );
  }

  const result = await signIn({
    email: req.body.email.trim().toLowerCase(),
    password: req.body.password,
    sourceIp: req.ip,
    userAgent: req.headers['user-agent'],
    correlationId: req.correlationId,
  });

  if (!result.success) {
    const extra = result.needsVerification
      ? { needsVerification: true, verificationEmail: result.email }
      : {};
    return res.render(
      'pages/auth/sign-in',
      authRenderOpts({
        title: 'Sign In',
        errors: { form: result.error },
        values: { email: req.body.email ?? '' },
        returnTo,
        ...extra,
      }),
    );
  }

  // Session fixation protection — regenerate session ID after auth
  const sessionUser = result.sessionUser;
  req.session.regenerate((err) => {
    if (err) {
      return res.render(
        'pages/auth/sign-in',
        authRenderOpts({ title: 'Sign In', errors: { form: 'Sign in failed. Please try again.' } }),
      );
    }
    req.session.user = sessionUser;
    req.session.authenticatedAt = Date.now();
    req.session.save(() => {
      res.redirect(safeRedirect(req, redirectByRole(sessionUser.platformRole)));
    });
  });
});

// ─── Google OpenID Connect ───────────────────────────────────────────────────

export const getGoogleStart = asyncHandler(async (req, res) => {
  if (!env.isGoogleAuthConfigured()) {
    await writeAuditEvent({
      action: 'auth.google.configuration_missing',
      outcome: AuditOutcome.FAILURE,
      sourceIp: req.ip,
      correlationId: req.correlationId,
    });
    req.flash('error', 'Google authentication is not configured.');
    return res.redirect('/auth/sign-in');
  }

  const intent = ['create-account', 'sign-in', 'reauthenticate'].includes(req.query.intent)
    ? req.query.intent
    : 'sign-in';
  if (intent === 'reauthenticate' && !req.session?.user) {
    return res.redirect('/auth/sign-in');
  }
  const state = generateRawToken(32);
  const nonce = generateRawToken(32);
  const { url, codeVerifier } = await createGoogleAuthorization({ state, nonce, intent });
  req.session.googleAuthTransaction = {
    state,
    nonce,
    codeVerifier,
    intent,
    userId: intent === 'reauthenticate' ? req.session.user.id : null,
    returnTo: isSafeReturnPath(req.query.returnTo) ? req.query.returnTo : null,
    expiresAt: Date.now() + GOOGLE_FLOW_TTL_MS,
  };
  req.session.save(() => res.redirect(url));
});

export function getGoogleReauthenticate(req, res) {
  if (!req.session?.user) {
    return res.redirect('/auth/sign-in');
  }
  const returnTo = isSafeReturnPath(req.query.returnTo) ? req.query.returnTo : '/dashboard';
  return res.redirect(
    `/auth/google/start?intent=reauthenticate&returnTo=${encodeURIComponent(returnTo)}`,
  );
}

export const getGoogleCallback = asyncHandler(async (req, res) => {
  const transaction = req.session?.googleAuthTransaction;
  delete req.session.googleAuthTransaction;

  if (
    !transaction ||
    transaction.expiresAt <= Date.now() ||
    typeof req.query.state !== 'string' ||
    req.query.state !== transaction.state
  ) {
    await writeAuditEvent({
      action: 'auth.google.transaction_invalid',
      outcome: AuditOutcome.DENIED,
      sourceIp: req.ip,
      correlationId: req.correlationId,
    });
    req.flash('error', 'Google authentication expired or could not be verified. Please try again.');
    return res.redirect('/auth/sign-in');
  }
  if (req.query.error || !req.query.code) {
    await writeAuditEvent({
      action: 'auth.google.cancelled',
      outcome: AuditOutcome.FAILURE,
      sourceIp: req.ip,
      correlationId: req.correlationId,
    });
    req.flash('error', 'Google authentication was cancelled.');
    return res.redirect('/auth/sign-in');
  }

  let identity;
  try {
    identity = await exchangeGoogleCode({
      code: req.query.code,
      codeVerifier: transaction.codeVerifier,
      expectedNonce: transaction.nonce,
    });
  } catch {
    logger.warn('Google authentication failed', {
      correlationId: req.correlationId,
    });
    await writeAuditEvent({
      action: 'auth.google.callback_failed',
      outcome: AuditOutcome.FAILURE,
      sourceIp: req.ip,
      correlationId: req.correlationId,
    });
    req.flash('error', 'Google authentication failed. Please try again.');
    return res.redirect('/auth/sign-in');
  }

  if (transaction.intent === 'reauthenticate') {
    const matches = await verifyGoogleReauthentication({
      userId: transaction.userId,
      identity,
      sourceIp: req.ip,
      correlationId: req.correlationId,
    });
    if (!matches || req.session?.user?.id !== transaction.userId) {
      req.flash('error', 'Please choose the Google account linked to your HelloDeploy account.');
      return res.redirect(transaction.returnTo || '/dashboard');
    }
    req.session.authenticatedAt = Date.now();
    req.flash('success', 'Google identity reconfirmed. You may now complete the sensitive action.');
    return req.session.save(() => res.redirect(transaction.returnTo || '/dashboard'));
  }

  const result = await resolveGoogleIdentity({
    identity,
    sourceIp: req.ip,
    userAgent: req.headers['user-agent'],
    correlationId: req.correlationId,
  });
  if (result.kind === 'authenticated') {
    return establishSession(req, res, result.sessionUser, transaction.returnTo);
  }
  if (result.kind === 'denied') {
    req.flash('error', result.error);
    return res.redirect('/auth/sign-in');
  }

  if (result.kind === 'complete') {
    await recordProductEvent({ name: 'signup_started' });
  }

  req.session.pendingGoogleIdentity = {
    identity,
    returnTo: transaction.returnTo,
    expiresAt: Date.now() + GOOGLE_FLOW_TTL_MS,
  };
  req.session.save(() =>
    res.redirect(
      result.kind === 'link' ? '/auth/google/link-account' : '/auth/google/complete-account',
    ),
  );
});

export function getGoogleCompleteAccount(req, res) {
  const identity = pendingGoogleIdentity(req);
  if (!identity) {
    return res.redirect('/auth/create-account');
  }
  return res.render(
    'pages/auth/google-complete-account',
    authRenderOpts({
      title: 'Complete Account',
      email: identity.email,
      values: { firstName: identity.firstName, lastName: identity.lastName },
    }),
  );
}

export const postGoogleCompleteAccount = asyncHandler(async (req, res) => {
  const identity = pendingGoogleIdentity(req);
  if (!identity) {
    return res.redirect('/auth/create-account');
  }
  const { errors, hasErrors } = validateGoogleAccountCompletion(req.body);
  if (!hasErrors) {
    const turnstileOk = await verifyTurnstileToken({
      token: req.body['cf-turnstile-response'],
      sourceIp: req.ip,
      expectedAction: 'google-create-account',
    });
    if (!turnstileOk) {
      errors.form = 'Bot protection check failed. Please try again.';
    }
  }
  if (Object.keys(errors).length > 0) {
    return res.render(
      'pages/auth/google-complete-account',
      authRenderOpts({
        title: 'Complete Account',
        email: identity.email,
        errors,
        values: { firstName: req.body.firstName ?? '', lastName: req.body.lastName ?? '' },
      }),
    );
  }

  const returnTo = req.session.pendingGoogleIdentity.returnTo;
  const result = await completeGoogleAccount({
    identity,
    firstName: req.body.firstName.trim(),
    lastName: req.body.lastName.trim(),
    sourceIp: req.ip,
    userAgent: req.headers['user-agent'],
    correlationId: req.correlationId,
  });
  if (!result.success) {
    delete req.session.pendingGoogleIdentity;
    req.flash('error', result.error);
    return res.redirect('/auth/sign-in');
  }
  return establishSession(req, res, result.sessionUser, returnTo, 'Welcome to HelloDeploy!');
});

export function getGoogleLinkAccount(req, res) {
  const identity = pendingGoogleIdentity(req);
  if (!identity) {
    return res.redirect('/auth/sign-in');
  }
  return res.render(
    'pages/auth/google-link-account',
    authRenderOpts({ title: 'Link Google Account', email: identity.email }),
  );
}

export const postGoogleLinkAccount = asyncHandler(async (req, res) => {
  const identity = pendingGoogleIdentity(req);
  if (!identity) {
    return res.redirect('/auth/sign-in');
  }
  if (!req.body.password) {
    return res.render(
      'pages/auth/google-link-account',
      authRenderOpts({
        title: 'Link Google Account',
        email: identity.email,
        errors: { password: 'Password is required.' },
      }),
    );
  }
  const returnTo = req.session.pendingGoogleIdentity.returnTo;
  const result = await linkGoogleAccount({
    identity,
    password: req.body.password,
    sourceIp: req.ip,
    userAgent: req.headers['user-agent'],
    correlationId: req.correlationId,
  });
  if (!result.success) {
    return res.render(
      'pages/auth/google-link-account',
      authRenderOpts({
        title: 'Link Google Account',
        email: identity.email,
        errors: { form: result.error },
      }),
    );
  }
  return establishSession(
    req,
    res,
    result.sessionUser,
    returnTo,
    'Google is now linked to your account.',
  );
});

// ─── Sign Out ──────────────────────────────────────────────────────────────────

export function postSignOut(req, res) {
  req.session.destroy(() => {
    res.clearCookie('hellodeploy.sid');
    res.redirect('/auth/sign-in');
  });
}

// ─── Forgot Password ───────────────────────────────────────────────────────────

export function getForgotPassword(req, res) {
  res.render('pages/auth/forgot-password', authRenderOpts({ title: 'Forgot Password' }));
}

const forgotPasswordDependencies = {
  verifyTurnstile: verifyTurnstileToken,
  initiateReset: initiatePasswordReset,
};

export async function handleForgotPassword(
  req,
  res,
  { verifyTurnstile, initiateReset } = forgotPasswordDependencies,
) {
  const { errors, hasErrors } = validateForgotPassword(req.body);
  const values = { email: req.body.email ?? '' };

  if (hasErrors) {
    return res.render(
      'pages/auth/forgot-password',
      authRenderOpts({ title: 'Forgot Password', errors, values }),
    );
  }

  const turnstileOk = await verifyTurnstile({
    token: req.body['cf-turnstile-response'],
    sourceIp: req.ip,
    expectedAction: 'forgot-password',
  });
  if (!turnstileOk) {
    return res.render(
      'pages/auth/forgot-password',
      authRenderOpts({
        title: 'Forgot Password',
        errors: { form: 'Bot protection check failed. Please try again.' },
        values,
      }),
    );
  }

  await initiateReset({
    email: req.body.email.trim().toLowerCase(),
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  // Always redirect to step 2 — never confirm whether email exists
  req.session.passwordResetEmail = req.body.email.trim().toLowerCase();
  req.session.save(() => {
    res.redirect('/auth/verify-reset-code');
  });
}

export const postForgotPassword = asyncHandler((req, res) => handleForgotPassword(req, res));

// ─── Verify Reset Code ─────────────────────────────────────────────────────────

export function getVerifyResetCode(req, res) {
  if (!req.session?.passwordResetEmail) {
    return res.redirect('/auth/forgot-password');
  }
  res.render('pages/auth/verify-reset-code', authRenderOpts({ title: 'Verify Reset Code' }));
}

export const postVerifyResetCode = asyncHandler(async (req, res) => {
  if (!req.session?.passwordResetEmail) {
    return res.redirect('/auth/forgot-password');
  }

  const { errors, hasErrors } = validateResetCode(req.body);
  if (hasErrors) {
    return res.render(
      'pages/auth/verify-reset-code',
      authRenderOpts({ title: 'Verify Reset Code', errors }),
    );
  }

  const result = await verifyPasswordResetCode({
    email: req.session.passwordResetEmail,
    code: req.body.code,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return res.render(
      'pages/auth/verify-reset-code',
      authRenderOpts({ title: 'Verify Reset Code', errors: { form: result.error } }),
    );
  }

  // Mark step 2 as complete — step 3 checks this flag
  req.session.passwordResetVerified = true;
  req.session.save(() => {
    res.redirect('/auth/new-password');
  });
});

// ─── New Password ──────────────────────────────────────────────────────────────

export function getNewPassword(req, res) {
  if (!req.session?.passwordResetEmail || !req.session?.passwordResetVerified) {
    return res.redirect('/auth/forgot-password');
  }
  res.render('pages/auth/new-password', authRenderOpts({ title: 'New Password' }));
}

export const postNewPassword = asyncHandler(async (req, res) => {
  if (!req.session?.passwordResetEmail || !req.session?.passwordResetVerified) {
    return res.redirect('/auth/forgot-password');
  }

  const { errors, hasErrors } = validateNewPassword(req.body);
  if (hasErrors) {
    return res.render('pages/auth/new-password', authRenderOpts({ title: 'New Password', errors }));
  }

  const result = await completePasswordReset({
    email: req.session.passwordResetEmail,
    newPassword: req.body.password,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return res.render(
      'pages/auth/new-password',
      authRenderOpts({ title: 'New Password', errors: { form: result.error } }),
    );
  }

  // Clean up reset session state
  delete req.session.passwordResetEmail;
  delete req.session.passwordResetVerified;

  req.flash('success', 'Password updated. Please sign in with your new password.');
  req.session.save(() => {
    res.redirect('/auth/sign-in');
  });
});
