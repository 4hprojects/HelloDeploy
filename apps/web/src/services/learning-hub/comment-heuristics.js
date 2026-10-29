import { createHash } from 'node:crypto';

// Lookalike letters from Cyrillic and Greek that are used to sneak words past
// filters. NFKC (applied at input) already folds full-width and styled forms.
const HOMOGLYPHS = Object.freeze({
  а: 'a',
  в: 'b',
  е: 'e',
  ё: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  ѕ: 's',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
  α: 'a',
  β: 'b',
  ε: 'e',
  η: 'n',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
});
// Format and filler characters that render as nothing (zero-width spaces, soft
// hyphens, Hangul fillers, and similar).
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu;

// Local addresses in error logs and setup steps are not outbound links.
const LOCAL_HOST =
  /(?:\b(?:https?|ftp):\/\/)?\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)(?::\d+)?(?:\/\S*)?/g;
const URL_SCHEME = /\b(?:https?|ftp):\/\/|\bwww\s*(?:\.|\(dot\)|\[dot\])/;
// Domains written plainly or with "dot" spelled out; file names such as
// server.js or package.json do not match because those are not in the list.
const DOMAIN =
  /\b[a-z0-9-]{2,}\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*(?:com|net|org|io|co|ph|xyz|info|biz|ru|cn|shop|top|online|site|store|app|dev|me|ly|gg|link|click|live|vip|bet|win|cc|tk)\b/;
const EMAIL =
  /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\sat\s)\s*[a-z0-9-]+\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*[a-z]{2,}/;
const PHONE =
  /(?:\+63|\b0)\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b|\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/;
const PROMOTION_TERMS = [
  /\bbuy\b/,
  /\bcheap\b/,
  /\bdiscount\b/,
  /\bpromo(?:tion)?\b/,
  /\bcasino\b/,
  /\bbetting\b/,
  /\bsabong\b/,
  /\bloans?\b/,
  /\bcrypto\b/,
  /\bforex\b/,
  /\bfollowers\b/,
  /\bviagra\b/,
  /\bescort\b/,
  /\bwhats\s?app\b/,
  /\btelegram\b/,
  /\bdm\s+me\b/,
  /\bearn\s+\$?\d+/,
  /\bguaranteed\s+(?:income|profit|returns?)\b/,
  /\bkumita\b/,
];
const CHARACTER_FLOOD = /(.)\1{24,}/u;

/** Text reduced to what a reader actually sees, for pattern checks only. */
export function foldForScreening(text) {
  return [...text.normalize('NFKC').replace(INVISIBLE, '').toLowerCase()]
    .map((character) => HOMOGLYPHS[character] ?? character)
    .join('');
}

/**
 * Deterministic pre-moderation checks. Returns the first finding:
 * `revise` asks the writer to edit, `reject` refuses outright.
 */
export function screenComment({ displayName, body }) {
  const name = foldForScreening(displayName);
  const text = foldForScreening(body);
  const outbound = (value) => {
    const withoutLocal = value.replace(LOCAL_HOST, ' ');
    return URL_SCHEME.test(withoutLocal) || DOMAIN.test(withoutLocal);
  };

  if (outbound(name) || EMAIL.test(name) || PHONE.test(name)) {
    return { decision: 'revise', reason: 'name_contact', field: 'displayName' };
  }
  const promotionHits = PROMOTION_TERMS.filter((term) => term.test(text)).length;
  if (promotionHits >= 2) {
    return { decision: 'reject', reason: 'promotion' };
  }
  if (outbound(text)) {
    return { decision: 'revise', reason: 'link', field: 'body' };
  }
  if (EMAIL.test(text) || PHONE.test(text)) {
    return { decision: 'revise', reason: 'personal_data', field: 'body' };
  }
  if (CHARACTER_FLOOD.test(text)) {
    return { decision: 'revise', reason: 'flood', field: 'body' };
  }
  return { decision: 'pass', reason: null };
}

/** Stable fingerprint for spotting the same text posted again. */
export function commentFingerprint(body) {
  const folded = foldForScreening(body)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return createHash('sha256').update(folded).digest('hex').slice(0, 32);
}
