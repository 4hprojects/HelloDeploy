import { User } from '@hellodeploy/database';
import { verifyPassword } from '@hellodeploy/auth';

import { asyncHandler } from '../utils/async-handler.js';
import {
  changePassword,
  getAccountOverview,
  requestAccountClosure,
  updateProfile,
} from '../services/account.service.js';
import { validatePasswordChange, validateProfile } from '../validators/account.validator.js';

// Same window as other irreversible actions confirmed through Google.
const SENSITIVE_AUTH_MAX_AGE_MS = 10 * 60 * 1000;

async function renderAccount(req, res, extra = {}) {
  const account = await getAccountOverview(req.session.user.id);
  res.status(extra.status ?? 200).render('pages/account', {
    title: 'Account',
    account,
    sensitiveAuthRecent:
      Date.now() - Number(req.session.authenticatedAt ?? 0) <= SENSITIVE_AUTH_MAX_AGE_MS,
    profileErrors: {},
    passwordErrors: {},
    ...extra,
  });
}

export const getAccount = asyncHandler(async (req, res) => {
  await renderAccount(req, res);
});

export const postProfile = asyncHandler(async (req, res) => {
  const { errors, hasErrors, values } = validateProfile(req.body);
  if (hasErrors) {
    return renderAccount(req, res, { status: 400, profileErrors: errors });
  }

  const result = await updateProfile({
    userId: req.session.user.id,
    ...values,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });
  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect('/account');
  }
  req.session.user = result.sessionUser;
  req.flash('success', 'Your name was updated.');
  res.redirect('/account');
});

export const postPassword = asyncHandler(async (req, res) => {
  const { errors, hasErrors } = validatePasswordChange(req.body);
  if (hasErrors) {
    return renderAccount(req, res, { status: 400, passwordErrors: errors });
  }

  const result = await changePassword({
    userId: req.session.user.id,
    currentPassword: req.body.currentPassword,
    newPassword: req.body.password,
    sessionId: req.sessionID,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });
  if (!result.success) {
    return renderAccount(req, res, {
      status: 400,
      passwordErrors: { currentPassword: result.error },
    });
  }
  req.session.user = result.sessionUser;
  req.flash('success', 'Your password was changed. Other browsers were signed out.');
  res.redirect('/account');
});

export const postClosureRequest = asyncHandler(async (req, res) => {
  const user = await User.findById(req.session.user.id).select('+passwordHash');
  const passwordConfirmed = user?.passwordHash
    ? await verifyPassword(user.passwordHash, req.body.currentPassword ?? '')
    : false;
  const googleConfirmed =
    user?.googleSubject &&
    !user.passwordHash &&
    Date.now() - Number(req.session.authenticatedAt ?? 0) <= SENSITIVE_AUTH_MAX_AGE_MS;
  if (!user || (!passwordConfirmed && !googleConfirmed)) {
    req.flash(
      'error',
      user?.passwordHash
        ? 'Your current password is incorrect. No closure request was sent.'
        : 'Reconfirm your Google account before requesting closure.',
    );
    return res.redirect('/account#close-account');
  }

  const result = await requestAccountClosure({
    userId: user._id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });
  req.flash(
    result.success ? 'success' : 'error',
    result.success
      ? 'Closure requested. An administrator will review it and delete the account.'
      : result.error,
  );
  res.redirect('/account#close-account');
});
