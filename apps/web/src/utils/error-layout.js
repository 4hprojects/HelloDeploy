/**
 * Which layout an error page should use.
 *
 * Error pages are reached by signed-out visitors as well as signed-in users —
 * a 500 on a marketing page, a stale CSRF token on the contact form, a rate
 * limit, a mistyped URL. Handing a visitor the authenticated app chrome gives
 * them a sidebar of links they cannot use.
 *
 * @param {import('express').Request} req
 * @returns {string} A layout path.
 */
export function layoutForRequest(req) {
  return req?.session?.user ? 'layouts/main' : 'layouts/public';
}
