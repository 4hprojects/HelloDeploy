/** Categories a visitor can file a message under, matching the Contact page. */
export const CONTACT_CATEGORIES = Object.freeze([
  { value: 'DEPLOYMENT', label: 'Deployment support' },
  { value: 'ACCOUNT', label: 'Account support' },
  { value: 'BUG', label: 'Bug report' },
  { value: 'FEATURE', label: 'Feature request' },
  { value: 'BILLING', label: 'Plans and billing' },
  { value: 'BUSINESS', label: 'Business or partnership' },
]);

const CATEGORY_VALUES = CONTACT_CATEGORIES.map((category) => category.value);

const LIMITS = Object.freeze({
  name: 100,
  email: 254,
  subject: 150,
  message: 5000,
  projectUrl: 253,
  deploymentId: 100,
});

// Values reach an email subject line, so a newline must never survive validation.
const CONTROL_CHARACTERS = /[\r\n\t\0]/;

/**
 * Validate a contact form submission.
 *
 * @returns {{ values: object, errors: Record<string, string>, hasErrors: boolean }}
 */
export function validateContactMessage(body = {}) {
  const values = {
    name: (body.name ?? '').trim(),
    email: (body.email ?? '').trim().toLowerCase(),
    category: (body.category ?? '').trim(),
    subject: (body.subject ?? '').trim(),
    message: (body.message ?? '').trim(),
    projectUrl: (body.projectUrl ?? '').trim(),
    deploymentId: (body.deploymentId ?? '').trim(),
  };

  const errors = {};

  if (!values.name) {
    errors.name = 'Your name is required.';
  } else if (values.name.length > LIMITS.name) {
    errors.name = `Name must not exceed ${LIMITS.name} characters.`;
  }

  if (!values.email) {
    errors.email = 'An email address is required so we can reply.';
  } else if (
    values.email.length > LIMITS.email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)
  ) {
    errors.email = 'Enter a valid email address.';
  }

  if (!values.category) {
    errors.category = 'Choose a category.';
  } else if (!CATEGORY_VALUES.includes(values.category)) {
    errors.category = 'Choose a category from the list.';
  }

  if (!values.subject) {
    errors.subject = 'A subject is required.';
  } else if (values.subject.length > LIMITS.subject) {
    errors.subject = `Subject must not exceed ${LIMITS.subject} characters.`;
  } else if (CONTROL_CHARACTERS.test(values.subject)) {
    errors.subject = 'Subject must be a single line.';
  }

  if (!values.message) {
    errors.message = 'A message is required.';
  } else if (values.message.length > LIMITS.message) {
    errors.message = `Message must not exceed ${LIMITS.message} characters.`;
  }

  if (values.projectUrl.length > LIMITS.projectUrl) {
    errors.projectUrl = `Project address must not exceed ${LIMITS.projectUrl} characters.`;
  }

  if (values.deploymentId.length > LIMITS.deploymentId) {
    errors.deploymentId = `Deployment reference must not exceed ${LIMITS.deploymentId} characters.`;
  }

  return { values, errors, hasErrors: Object.keys(errors).length > 0 };
}
