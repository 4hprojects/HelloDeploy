import { logger } from '@hellodeploy/observability';

import { sendContactMessage } from '../services/email.service.js';
import { verifyTurnstile } from '../services/turnstile.service.js';
import { CONTACT_CATEGORIES, validateContactMessage } from '../validators/contact.validator.js';

const PAGE = Object.freeze({
  title: 'Contact',
  description:
    'Contact HelloDeploy for deployment support, account questions, bug reports, feature requests, plan enquiries, and partnerships.',
});

function renderContact(res, extra = {}) {
  res.render('pages/contact', {
    ...PAGE,
    categories: CONTACT_CATEGORIES,
    values: {},
    errors: {},
    sent: false,
    layout: 'layouts/public',
    ...extra,
  });
}

export function getContact(_req, res) {
  renderContact(res);
}

export async function postContact(req, res) {
  // Bots fill every field they find; a visitor never sees this one.
  if ((req.body.website ?? '').trim()) {
    logger.info('[contact] Discarded honeypot submission', { correlationId: req.correlationId });
    return renderContact(res, { sent: true });
  }

  const { values, errors, hasErrors } = validateContactMessage(req.body);

  // Checked after validation so a visitor who mistypes a field is not told to
  // redo the challenge as well.
  if (!hasErrors && !(await verifyTurnstile(req.body['cf-turnstile-response'], req.ip))) {
    logger.warn('[contact] Turnstile verification failed', { correlationId: req.correlationId });
    errors.turnstile = 'Could not confirm you are human. Please try the challenge again.';
  }

  if (hasErrors || errors.turnstile) {
    return res.status(400).render('pages/contact', {
      ...PAGE,
      categories: CONTACT_CATEGORIES,
      values,
      errors,
      sent: false,
      layout: 'layouts/public',
    });
  }

  const category = CONTACT_CATEGORIES.find((entry) => entry.value === values.category);

  try {
    await sendContactMessage({ ...values, categoryLabel: category.label });
  } catch (err) {
    // The visitor cannot fix a delivery failure, so tell them plainly rather
    // than claiming a message was sent that never arrived.
    logger.error('[contact] Failed to deliver contact message', {
      error: err.message,
      correlationId: req.correlationId,
    });
    return res.status(502).render('pages/contact', {
      ...PAGE,
      categories: CONTACT_CATEGORIES,
      values,
      errors: {},
      sent: false,
      deliveryFailed: true,
      layout: 'layouts/public',
    });
  }

  return renderContact(res, { sent: true });
}
