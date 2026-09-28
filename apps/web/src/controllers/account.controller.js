import { asyncHandler } from '../utils/async-handler.js';
import { isSafeReturnPath } from '../utils/safe-redirect.js';
import { UiMode } from '@hellodeploy/contracts';
import { User } from '@hellodeploy/database';
import { logger } from '@hellodeploy/observability';

/**
 * Resolve a caller-supplied return path to a safe same-origin destination.
 * Anything absolute, protocol-relative, or otherwise not a plain local path is
 * discarded so the toggle cannot be used as an open redirect.
 */
function safeReturnPath(candidate) {
  return isSafeReturnPath(candidate) ? candidate : '/dashboard';
}

/**
 * Switch the signed-in account between SIMPLE and ADVANCED interface modes.
 * Presentation-only: it changes which controls render, never what the account
 * is permitted to do, so no project-level authorization applies.
 */
export const postUiMode = asyncHandler(async (req, res) => {
  const requested = req.body?.uiMode;
  const returnTo = safeReturnPath(req.body?.returnTo);

  if (!Object.values(UiMode).includes(requested)) {
    req.flash('error', 'That interface mode is not available.');
    return res.redirect(returnTo);
  }

  await User.updateOne({ _id: req.session.user.id }, { $set: { uiMode: requested } });
  // Mirror into the session so the next render reflects the change without a reload.
  req.session.user.uiMode = requested;

  logger.info('Account: interface mode changed', {
    userId: req.session.user.id,
    uiMode: requested,
  });

  req.flash(
    'success',
    requested === UiMode.ADVANCED
      ? 'Advanced mode on. Technical settings are now visible.'
      : 'Simple mode on. Technical settings are hidden but unchanged.',
  );
  return res.redirect(returnTo);
});
