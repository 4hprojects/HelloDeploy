import { randomInt, createHash } from 'node:crypto';
import { User } from '@hellodeploy/database';
import { hashPassword, verifyPassword, generateToken, hashToken } from '@hellodeploy/auth';
import { AuditOutcome, UserStatus, PlatformRole } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} from './email.service.js';
import { env } from '../config/env.js';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const RESET_MAX_ATTEMPTS = 5;

// Generic failure — identical whether email exists or not to prevent enumeration.
const GENERIC_AUTH_FAILURE = 'Email address or password is incorrect.';

function generateSixDigitCode() {
  const code = randomInt(100_000, 999_999).toString();
  const hash = createHash('sha256').update(code).digest('hex');
  return { code, hash };
}

function baseUrl() {
  return env.isProduction() ? `https://${env.PLATFORM_DOMAIN}` : `http://localhost:${env.PORT}`;
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register a new user.
 * Returns null on duplicate email (silent — caller shows "check your email" either way).
 */
export async function registerUser({
  firstName,
  lastName,
  email,
  password,
  sourceIp,
  correlationId,
}) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    await writeAuditEvent({
      action: 'auth.register.duplicate_email',
      outcome: AuditOutcome.FAILURE,
      sourceIp,
      correlationId,
    });
    return null;
  }

  const passwordHash = await hashPassword(password);
  const { raw: tokenRaw, hash: tokenHash } = generateToken(32);

  const user = await User.create({
    firstName,
    lastName,
    email: email.toLowerCase(),
    passwordHash,
    platformRole: PlatformRole.USER,
    status: UserStatus.PENDING_VERIFICATION,
    emailVerificationTokenHash: tokenHash,
    emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
  });

  const verificationUrl = `${baseUrl()}/auth/verify-email?token=${tokenRaw}`;
  await sendVerificationEmail({ to: user.email, firstName: user.firstName, verificationUrl });

  await writeAuditEvent({
    action: 'auth.register',
    outcome: AuditOutcome.SUCCESS,
    actorId: user._id.toString(),
    actorRole: user.platformRole,
    targetType: 'user',
    targetId: user._id.toString(),
    sourceIp,
    correlationId,
  });

  return { user };
}

// ─── Email verification ────────────────────────────────────────────────────────

export async function verifyEmail({ rawToken, sourceIp, correlationId }) {
  const tokenHash = hashToken(rawToken);

  const user = await User.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationExpiresAt: { $gt: new Date() },
    status: UserStatus.PENDING_VERIFICATION,
  }).select('+emailVerificationTokenHash');

  if (!user) {
    return { success: false, error: 'This verification link is invalid or has expired.' };
  }

  user.status = UserStatus.ACTIVE;
  user.emailVerifiedAt = new Date();
  user.emailVerificationTokenHash = null;
  user.emailVerificationExpiresAt = null;
  await user.save();

  await writeAuditEvent({
    action: 'auth.email_verified',
    outcome: AuditOutcome.SUCCESS,
    actorId: user._id.toString(),
    actorRole: user.platformRole,
    targetType: 'user',
    targetId: user._id.toString(),
    sourceIp,
    correlationId,
  });

  return { success: true, user };
}

export async function resendVerificationEmail({ email, sourceIp, correlationId }) {
  const user = await User.findOne({
    email: email.toLowerCase(),
    status: UserStatus.PENDING_VERIFICATION,
  }).select('+emailVerificationTokenHash');

  if (!user) {
    return; // Silent
  }

  const { raw: tokenRaw, hash: tokenHash } = generateToken(32);
  user.emailVerificationTokenHash = tokenHash;
  user.emailVerificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
  await user.save();

  const verificationUrl = `${baseUrl()}/auth/verify-email?token=${tokenRaw}`;
  await sendVerificationEmail({ to: user.email, firstName: user.firstName, verificationUrl });

  await writeAuditEvent({
    action: 'auth.verification_resent',
    outcome: AuditOutcome.SUCCESS,
    actorId: user._id.toString(),
    targetType: 'user',
    targetId: user._id.toString(),
    sourceIp,
    correlationId,
  });
}

// ─── Sign in ──────────────────────────────────────────────────────────────────

export async function signIn({ email, password, sourceIp, userAgent, correlationId }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

  if (!user) {
    // Run a hash to prevent timing-based enumeration
    await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$placeholder', 'timing-stub');
    await writeAuditEvent({
      action: 'auth.sign_in.unknown_email',
      outcome: AuditOutcome.FAILURE,
      sourceIp,
      correlationId,
    });
    return { success: false, error: GENERIC_AUTH_FAILURE };
  }

  const passwordOk = await verifyPassword(user.passwordHash, password);

  if (!passwordOk) {
    await writeAuditEvent({
      action: 'auth.sign_in.wrong_password',
      outcome: AuditOutcome.FAILURE,
      actorId: user._id.toString(),
      sourceIp,
      correlationId,
    });
    return { success: false, error: GENERIC_AUTH_FAILURE };
  }

  if (user.status === UserStatus.PENDING_VERIFICATION) {
    return {
      success: false,
      error: 'Please verify your email address before signing in.',
      needsVerification: true,
      email: user.email,
    };
  }

  if (user.status === UserStatus.SUSPENDED) {
    await writeAuditEvent({
      action: 'auth.sign_in.suspended',
      outcome: AuditOutcome.DENIED,
      actorId: user._id.toString(),
      sourceIp,
      correlationId,
    });
    return {
      success: false,
      error: 'This account has been suspended. Contact support for assistance.',
    };
  }

  if (user.status !== UserStatus.ACTIVE) {
    return { success: false, error: GENERIC_AUTH_FAILURE };
  }

  user.lastLoginAt = new Date();
  await user.save();

  await writeAuditEvent({
    action: 'auth.sign_in',
    outcome: AuditOutcome.SUCCESS,
    actorId: user._id.toString(),
    actorRole: user.platformRole,
    targetType: 'user',
    targetId: user._id.toString(),
    sourceIp,
    userAgent,
    correlationId,
  });

  return { success: true, sessionUser: user.toSessionUser() };
}

// ─── Password recovery ────────────────────────────────────────────────────────

/**
 * Step 1: Accept email, send 6-digit code.
 * Always silent — same response whether email exists or not.
 */
export async function initiatePasswordReset({ email, sourceIp, correlationId }) {
  const user = await User.findOne({
    email: email.toLowerCase(),
    status: UserStatus.ACTIVE,
  });

  if (!user) {
    return;
  }

  const { code, hash: codeHash } = generateSixDigitCode();

  user.passwordResetTokenHash = codeHash;
  user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  user.passwordResetAttempts = 0;
  await user.save();

  await sendPasswordResetEmail({ to: user.email, firstName: user.firstName, resetCode: code });

  await writeAuditEvent({
    action: 'auth.password_reset_initiated',
    outcome: AuditOutcome.SUCCESS,
    actorId: user._id.toString(),
    sourceIp,
    correlationId,
  });
}

/**
 * Step 2: Verify the 6-digit code.
 * On success, the caller stores `email` in the session to authorise step 3.
 */
export async function verifyPasswordResetCode({ email, code, sourceIp, correlationId }) {
  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({
    email: normalizedEmail,
    status: UserStatus.ACTIVE,
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordResetTokenHash');

  if (!user) {
    return { success: false, error: 'Reset code is invalid or has expired.' };
  }

  if (user.passwordResetAttempts >= RESET_MAX_ATTEMPTS) {
    return { success: false, error: 'Too many incorrect attempts. Please request a new code.' };
  }

  const submittedHash = createHash('sha256').update(code.trim()).digest('hex');

  if (user.passwordResetTokenHash !== submittedHash) {
    user.passwordResetAttempts += 1;
    await user.save();
    return { success: false, error: 'Reset code is incorrect.' };
  }

  // Invalidate the code — step 3 is authorised by the session flag set by the controller
  user.passwordResetTokenHash = null;
  user.passwordResetAttempts = 0;
  await user.save();

  await writeAuditEvent({
    action: 'auth.password_reset_code_verified',
    outcome: AuditOutcome.SUCCESS,
    actorId: user._id.toString(),
    sourceIp,
    correlationId,
  });

  return { success: true, email: normalizedEmail };
}

/**
 * Step 3: Set new password. Requires session flag set by step 2.
 */
export async function completePasswordReset({ email, newPassword, sourceIp, correlationId }) {
  const user = await User.findOne({
    email: email.toLowerCase(),
    status: UserStatus.ACTIVE,
  }).select('+passwordHash');

  if (!user) {
    return { success: false, error: 'Unable to complete reset. Please start over.' };
  }

  const newHash = await hashPassword(newPassword);
  user.passwordHash = newHash;
  user.configVersion += 1;
  await user.save();

  await sendPasswordChangedEmail({ to: user.email, firstName: user.firstName });

  await writeAuditEvent({
    action: 'auth.password_reset_completed',
    outcome: AuditOutcome.SUCCESS,
    actorId: user._id.toString(),
    sourceIp,
    correlationId,
  });

  return { success: true };
}
