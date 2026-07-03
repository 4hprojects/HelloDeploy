import mongoose from 'mongoose';

/**
 * `router.param`-compatible guard: rejects route params that are not valid
 * Mongo ObjectIds with a 404 before they reach `findById` (which would throw
 * a CastError → 500).
 */
export function validateObjectId(req, res, next, value) {
  if (!mongoose.isValidObjectId(value)) {
    return res.status(404).render('pages/404', { title: 'Page Not Found', layout: 'layouts/main' });
  }
  next();
}
