export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 60;
export const BODY_MIN = 10;
export const BODY_MAX = 2000;

const OBJECT_ID = /^[a-f0-9]{24}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;
// C0/C1 controls except tab and newline, bidi overrides used to disguise text,
// and invisible characters (zero-width joiner kept for emoji sequences).
const UNSAFE_CHARACTERS =
  /(?![\t\n])\p{Cc}|[\u202A-\u202E\u2066-\u2069]|(?!\u200D)\p{Default_Ignorable_Code_Point}/gu;

/**
 * Validate and normalize a guest comment submission. Returns
 * `{ value, errors }`; errors are keyed by field for the form.
 */
export function parseCommentInput(body) {
  const errors = {};
  const displayName = normalizeText(body?.displayName).replace(/\s+/g, ' ');
  const text = normalizeText(body?.body)
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  if (displayName.length < DISPLAY_NAME_MIN || displayName.length > DISPLAY_NAME_MAX) {
    errors.displayName = `Enter a display name of ${DISPLAY_NAME_MIN}–${DISPLAY_NAME_MAX} characters.`;
  }
  if (text.length < BODY_MIN || text.length > BODY_MAX) {
    errors.body = `Write a comment of ${BODY_MIN}–${BODY_MAX} characters.`;
  }

  const replyTo = typeof body?.replyTo === 'string' ? body.replyTo.trim() : '';
  if (replyTo && !OBJECT_ID.test(replyTo)) {
    errors.replyTo = 'The comment you are replying to no longer exists.';
  }
  const idempotencyKey = typeof body?.submissionKey === 'string' ? body.submissionKey : '';
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    errors.form = 'Refresh the page and try again.';
  }

  return {
    value: { displayName, body: text, replyTo: replyTo || null, idempotencyKey },
    errors,
  };
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.normalize('NFKC').replace(UNSAFE_CHARACTERS, '').trim();
}
