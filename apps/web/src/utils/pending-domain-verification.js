/**
 * The plaintext domain verification token exists only once, in the response to
 * the add-domain POST — the database stores nothing but its hash. It therefore
 * has to survive the redirect to the domains page in the session.
 *
 * Stamping it with the project it belongs to is what keeps it off every other
 * project's page, and handing it back only by deleting it is what keeps
 * "shown only once" true. Both were missing: the token rendered wherever the
 * user happened to navigate, and the clear ran after the response had already
 * been written, so it never reached the store.
 */
const SESSION_KEY = 'pendingDomainVerification';

export function stashPendingDomainVerification(req, { hostname, token }) {
  req.session[SESSION_KEY] = {
    projectId: req.project._id.toString(),
    hostname,
    token,
  };
}

/**
 * Take the pending verification for the project being viewed, clearing it.
 *
 * A stash belonging to another project is left where it is: the user still
 * needs it on that project's own page, and the only recovery from losing it is
 * removing the domain and adding it again, which restarts DNS propagation.
 */
export function consumePendingDomainVerification(req) {
  const pending = req.session?.[SESSION_KEY];
  if (!pending || pending.projectId !== req.project._id.toString()) {
    return { token: null, hostname: null };
  }

  delete req.session[SESSION_KEY];
  return { token: pending.token, hostname: pending.hostname };
}
