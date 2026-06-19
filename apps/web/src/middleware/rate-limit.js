import rateLimit from 'express-rate-limit';

const onLimitReached = (req, res, _options) => {
  // Serve a friendly HTML page for browser requests, JSON for API
  if (req.accepts('html')) {
    res.status(429).render('pages/error', {
      title: 'Too Many Requests',
      layout: 'layouts/main',
      message: 'Too many requests. Please wait a moment and try again.',
    });
  } else {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    });
  }
};

/** General pages / static assets */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

/** Registration — strict to deter spam accounts */
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

/** Sign-in attempts */
export const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

/** Verification email resend */
export const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

/** Password reset initiation */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});
