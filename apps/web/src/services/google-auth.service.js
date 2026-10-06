import { OAuth2Client } from 'google-auth-library';
import { User } from '@hellodeploy/database';
import { verifyPassword } from '@hellodeploy/auth';
import { AuditOutcome, PlatformRole, UserStatus } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import { env } from '../config/env.js';
import { recordProductEvent } from './product-analytics.service.js';

const GOOGLE_SCOPES = ['openid', 'email', 'profile'];
const LINK_MAX_ATTEMPTS = 10;
const LINK_LOCK_MS = 15 * 60 * 1000;

function callbackUrl() {
  return env.isProduction()
    ? `https://${env.PLATFORM_DOMAIN}/auth/google/callback`
    : `http://localhost:${env.PORT}/auth/google/callback`;
}

function client() {
  return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, callbackUrl());
}

function auditContext(user, extra = {}) {
  return {
    actorId: user?._id?.toString(),
    actorRole: user?.platformRole,
    targetType: user ? 'user' : null,
    targetId: user?._id?.toString(),
    ...extra,
  };
}

export async function createGoogleAuthorization({ state, nonce, intent }) {
  const oauthClient = client();
  const { codeVerifier, codeChallenge } = await oauthClient.generateCodeVerifierAsync();
  const url = oauthClient.generateAuthUrl({
    access_type: 'online',
    scope: GOOGLE_SCOPES,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: intent === 'reauthenticate' ? 'select_account' : undefined,
  });
  return { url, codeVerifier };
}

export async function exchangeGoogleCode({ code, codeVerifier, expectedNonce }) {
  const oauthClient = client();
  const { tokens } = await oauthClient.getToken({ code, codeVerifier });
  if (!tokens.id_token) {
    throw new Error('Google did not return an identity token.');
  }

  const ticket = await oauthClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload || payload.nonce !== expectedNonce) {
    throw new Error('Google nonce validation failed.');
  }
  if (!payload.sub || !payload.email || payload.email_verified !== true) {
    throw new Error('Google did not return a verified email identity.');
  }

  return {
    subject: payload.sub,
    email: payload.email.trim().toLowerCase(),
    firstName: payload.given_name?.trim() ?? '',
    lastName: payload.family_name?.trim() ?? '',
  };
}

export async function resolveGoogleIdentity({ identity, sourceIp, userAgent, correlationId }) {
  const linked = await User.findOne({ googleSubject: identity.subject });
  if (linked) {
    if (linked.status === UserStatus.SUSPENDED) {
      await writeAuditEvent({
        action: 'auth.google.sign_in.suspended',
        outcome: AuditOutcome.DENIED,
        ...auditContext(linked, { sourceIp, userAgent, correlationId }),
      });
      return {
        kind: 'denied',
        error: 'This account has been suspended. Contact support for assistance.',
      };
    }
    if (linked.status !== UserStatus.ACTIVE) {
      return { kind: 'denied', error: 'Unable to sign in with Google.' };
    }

    linked.lastLoginAt = new Date();
    linked.failedLoginAttempts = 0;
    linked.lockedUntil = null;
    await linked.save();
    await writeAuditEvent({
      action: 'auth.google.sign_in',
      outcome: AuditOutcome.SUCCESS,
      ...auditContext(linked, { sourceIp, userAgent, correlationId }),
    });
    return { kind: 'authenticated', sessionUser: linked.toSessionUser() };
  }

  const sameEmail = await User.findOne({ email: identity.email });
  if (sameEmail) {
    if (sameEmail.status === UserStatus.SUSPENDED) {
      await writeAuditEvent({
        action: 'auth.google.link.suspended',
        outcome: AuditOutcome.DENIED,
        ...auditContext(sameEmail, { sourceIp, userAgent, correlationId }),
      });
      return {
        kind: 'denied',
        error: 'This account has been suspended. Contact support for assistance.',
      };
    }
    if (![UserStatus.ACTIVE, UserStatus.PENDING_VERIFICATION].includes(sameEmail.status)) {
      return { kind: 'denied', error: 'Unable to sign in with Google.' };
    }
    return { kind: 'link', email: sameEmail.email };
  }

  return { kind: 'complete' };
}

export async function completeGoogleAccount({
  identity,
  firstName,
  lastName,
  sourceIp,
  userAgent,
  correlationId,
}) {
  try {
    const user = await User.create({
      firstName,
      lastName,
      email: identity.email,
      googleSubject: identity.subject,
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
    });
    await writeAuditEvent({
      action: 'auth.google.register',
      outcome: AuditOutcome.SUCCESS,
      ...auditContext(user, { sourceIp, userAgent, correlationId }),
    });
    await recordProductEvent({ name: 'signup_completed', userId: user._id });
    await recordProductEvent({ name: 'verification_completed', userId: user._id });
    return { success: true, sessionUser: user.toSessionUser() };
  } catch (error) {
    if (error?.code === 11000) {
      await writeAuditEvent({
        action: 'auth.google.register.collision',
        outcome: AuditOutcome.FAILURE,
        sourceIp,
        userAgent,
        correlationId,
      });
      return {
        success: false,
        error: 'That Google account is already associated with an account. Please start again.',
      };
    }
    throw error;
  }
}

export async function linkGoogleAccount({
  identity,
  password,
  sourceIp,
  userAgent,
  correlationId,
}) {
  const user = await User.findOne({ email: identity.email }).select('+passwordHash');
  const passwordOk = user?.passwordHash
    ? await verifyPassword(user.passwordHash, password)
    : await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$placeholder', password);

  const linkableStatus = [UserStatus.ACTIVE, UserStatus.PENDING_VERIFICATION].includes(
    user?.status,
  );
  if (!user || !passwordOk || !linkableStatus) {
    if (user && !passwordOk) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= LINK_MAX_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LINK_LOCK_MS);
        user.failedLoginAttempts = 0;
      }
      await user.save();
    }
    await writeAuditEvent({
      action: 'auth.google.link.denied',
      outcome: AuditOutcome.DENIED,
      ...auditContext(user, { sourceIp, userAgent, correlationId }),
    });
    return { success: false, error: 'Password confirmation failed. Google was not linked.' };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { success: false, error: 'Password confirmation failed. Google was not linked.' };
  }

  try {
    const now = new Date();
    const activating = user.status === UserStatus.PENDING_VERIFICATION;
    const updated = await User.findOneAndUpdate(
      { _id: user._id, googleSubject: null },
      {
        $set: {
          googleSubject: identity.subject,
          status: activating ? UserStatus.ACTIVE : user.status,
          emailVerifiedAt: user.emailVerifiedAt ?? now,
          lastLoginAt: now,
          failedLoginAttempts: 0,
          lockedUntil: null,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
        },
      },
      { new: true },
    );
    if (!updated) {
      return { success: false, error: 'Google could not be linked. Please start again.' };
    }

    await writeAuditEvent({
      action: 'auth.google.link',
      outcome: AuditOutcome.SUCCESS,
      ...auditContext(updated, { sourceIp, userAgent, correlationId }),
    });
    if (activating) {
      await recordProductEvent({ name: 'verification_completed', userId: updated._id });
    }
    return { success: true, sessionUser: updated.toSessionUser() };
  } catch (error) {
    if (error?.code === 11000) {
      return { success: false, error: 'That Google account is already linked elsewhere.' };
    }
    throw error;
  }
}

export async function verifyGoogleReauthentication({ userId, identity, sourceIp, correlationId }) {
  const user = await User.findById(userId);
  const matches = user?.googleSubject && user.googleSubject === identity.subject;
  await writeAuditEvent({
    action: matches ? 'auth.google.reauthenticate' : 'auth.google.reauthenticate.mismatch',
    outcome: matches ? AuditOutcome.SUCCESS : AuditOutcome.DENIED,
    ...auditContext(user, { sourceIp, correlationId }),
  });
  return matches;
}

export { callbackUrl as googleCallbackUrl };
