import { PlatformRole, UserStatus } from '@hellodeploy/contracts';

/**
 * Require the request to have an authenticated, active session.
 * Redirects unauthenticated requests to /auth/sign-in with a return URL.
 */
export function requireAuth(req, res, next) {
  if (!req.session?.user) {
    const returnTo = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/sign-in?returnTo=${returnTo}`);
  }

  if (req.session.user.status !== UserStatus.ACTIVE) {
    req.session.destroy(() => {});
    return res.redirect('/auth/sign-in?reason=account_suspended');
  }

  next();
}

/**
 * Require Super Admin role. Must be used after requireAuth.
 */
export function requireSuperAdmin(req, res, next) {
  if (req.session?.user?.platformRole !== PlatformRole.SUPER_ADMIN) {
    return res.status(403).render('pages/error', {
      title: 'Forbidden',
      layout: 'layouts/main',
      message: 'You do not have permission to access this page.',
    });
  }
  next();
}

/**
 * Require Admin or Super Admin role. Must be used after requireAuth.
 */
export function requireAdmin(req, res, next) {
  const role = req.session?.user?.platformRole;
  if (role !== PlatformRole.SUPER_ADMIN && role !== PlatformRole.ADMIN) {
    return res.status(403).render('pages/error', {
      title: 'Forbidden',
      layout: 'layouts/main',
      message: 'You do not have permission to access this page.',
    });
  }
  next();
}
