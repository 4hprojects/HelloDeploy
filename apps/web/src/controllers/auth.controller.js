import { PlatformRole } from '@hellodeploy/contracts';
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
  validateRegistration,
  validateSignIn,
  validateForgotPassword,
  validateResetCode,
  validateNewPassword,
} from '../validators/auth.validator.js';

// ─── Turnstile verification ────────────────────────────────────────────────────

async function verifyTurnstile(token, sourceIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Skip in development when no key is configured
    return true;
  }
  try {
    const body = new URLSearchParams({
      secret,
      response: token,
      remoteip: sourceIp ?? '',
    });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function authRenderOpts(extra = {}) {
  return { layout: 'layouts/auth', ...extra };
}

function safeRedirect(req, fallback) {
  const returnTo = req.query.returnTo ?? req.body.returnTo ?? '';
  // Prevent open redirect: only allow relative paths starting with /
  if (returnTo && /^\/[^/]/.test(returnTo)) {
    return returnTo;
  }
  return fallback;
}

function redirectByRole(role) {
  if (role === PlatformRole.SUPER_ADMIN || role === PlatformRole.ADMIN) {
    return '/admin';
  }
  return '/dashboard';
}

// ─── Create Account ────────────────────────────────────────────────────────────

export function getCreateAccount(req, res) {
  if (req.session?.user) {
    return res.redirect(redirectByRole(req.session.user.platformRole));
  }
  res.render('pages/auth/create-account', authRenderOpts({ title: 'Create Account' }));
}

export async function postCreateAccount(req, res) {
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

  const turnstileOk = await verifyTurnstile(req.body['cf-turnstile-response'], req.ip);
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

  await registerUser({
    firstName: req.body.firstName.trim(),
    lastName: req.body.lastName.trim(),
    email: req.body.email.trim().toLowerCase(),
    password: req.body.password,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  // Always show "check your email" — never confirm or deny whether email exists
  res.redirect('/auth/verify-email?submitted=1');
}

// ─── Verify Email ──────────────────────────────────────────────────────────────

export async function getVerifyEmail(req, res) {
  const { token, submitted, resent } = req.query;

  if (submitted) {
    return res.render(
      'pages/auth/verify-email',
      authRenderOpts({ title: 'Verify Email', submitted: true }),
    );
  }

  if (resent) {
    return res.render(
      'pages/auth/verify-email',
      authRenderOpts({ title: 'Verify Email', resent: true }),
    );
  }

  if (!token) {
    return res.render('pages/auth/verify-email', authRenderOpts({ title: 'Verify Email' }));
  }

  const result = await verifyEmail({
    rawToken: token,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return res.render(
      'pages/auth/verify-email',
      authRenderOpts({ title: 'Verify Email', error: result.error }),
    );
  }

  req.flash('success', 'Email verified. Welcome to HelloDeploy!');
  res.redirect('/auth/sign-in');
}

export async function postResendVerification(req, res) {
  const { email } = req.body;

  if (email) {
    await resendVerificationEmail({
      email: email.trim().toLowerCase(),
      sourceIp: req.ip,
      correlationId: req.correlationId,
    });
  }

  res.redirect('/auth/verify-email?resent=1');
}

// ─── Sign In ───────────────────────────────────────────────────────────────────

export function getSignIn(req, res) {
  if (req.session?.user) {
    return res.redirect(redirectByRole(req.session.user.platformRole));
  }
  const flashSuccess = res.locals.flash?.success ?? null;
  res.render('pages/auth/sign-in', authRenderOpts({ title: 'Sign In', success: flashSuccess }));
}

export async function postSignIn(req, res) {
  const { errors, hasErrors } = validateSignIn(req.body);

  if (hasErrors) {
    return res.render(
      'pages/auth/sign-in',
      authRenderOpts({
        title: 'Sign In',
        errors,
        values: { email: req.body.email ?? '' },
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
    req.session.save(() => {
      res.redirect(safeRedirect(req, redirectByRole(sessionUser.platformRole)));
    });
  });
}

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

export async function postForgotPassword(req, res) {
  const { errors, hasErrors } = validateForgotPassword(req.body);

  if (hasErrors) {
    return res.render(
      'pages/auth/forgot-password',
      authRenderOpts({ title: 'Forgot Password', errors }),
    );
  }

  await initiatePasswordReset({
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

// ─── Verify Reset Code ─────────────────────────────────────────────────────────

export function getVerifyResetCode(req, res) {
  if (!req.session?.passwordResetEmail) {
    return res.redirect('/auth/forgot-password');
  }
  res.render('pages/auth/verify-reset-code', authRenderOpts({ title: 'Verify Reset Code' }));
}

export async function postVerifyResetCode(req, res) {
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
}

// ─── New Password ──────────────────────────────────────────────────────────────

export function getNewPassword(req, res) {
  if (!req.session?.passwordResetEmail || !req.session?.passwordResetVerified) {
    return res.redirect('/auth/forgot-password');
  }
  res.render('pages/auth/new-password', authRenderOpts({ title: 'New Password' }));
}

export async function postNewPassword(req, res) {
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
}
