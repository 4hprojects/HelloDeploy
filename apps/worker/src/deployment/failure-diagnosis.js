// Recognize common, owner-fixable startup failures in an app's own output so
// the deployment can name the cause instead of a generic "didn't respond".
// Rules are deliberately narrow: a wrong diagnosis is worse than none.

const LOCAL_CONNECTION_REFUSED = /ECONNREFUSED\s+((?:127\.0\.0\.1|::1|localhost)(?::\d+)?)/;
const LISTEN_PORT_PATTERNS = [
  /"port"\s*:\s*(\d{2,5})\b/i,
  /\bport\s+(\d{2,5})\b/i,
  /(?:localhost|0\.0\.0\.0|127\.0\.0\.1|\[::\]):(\d{2,5})\b/,
];
const MISSING_MODULE = /Cannot find module '([^']+)'/;

/**
 * @param {string[]} lines  captured app output, oldest first
 * @param {{ appPort: number }} context
 * @returns {{ failureCode: string, detail: string } | null}
 */
export function diagnoseAppOutput(lines, { appPort }) {
  for (const line of lines) {
    const match = line.match(LOCAL_CONNECTION_REFUSED);
    if (match) {
      return {
        failureCode: 'APP_DATABASE_UNREACHABLE',
        detail: `Your app tried to connect to ${match[1]}, which is the app's own container, not a database. Set the database address on the Environment page to an online database.`,
      };
    }
  }

  for (const line of lines) {
    if (!/listen/i.test(line)) {
      continue;
    }
    const port = findListenPort(line);
    if (port !== null && port !== appPort) {
      return {
        failureCode: 'APP_PORT_MISMATCH',
        detail: `Your app is listening on port ${port}, but HelloDeploy expects port ${appPort} (the application port in Settings).`,
      };
    }
  }

  for (const line of lines) {
    const match = line.match(MISSING_MODULE);
    if (match || line.includes('MODULE_NOT_FOUND')) {
      const missing = match ? ` (${match[1]})` : '';
      return {
        failureCode: 'APP_BUILD_OUTPUT_MISSING',
        detail: `Your app is missing a file it needs to start${missing}. It probably needs a build command in Settings.`,
      };
    }
  }

  return null;
}

function findListenPort(line) {
  for (const pattern of LISTEN_PORT_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

// Node prints an uncaught exception as "Error: message" (or "TypeError: …").
const THROWN_ERROR = /^\s*(?:Uncaught\s+)?(\w*Error):\s+(.+)$/;
const CRASH_OUTPUT = [
  THROWN_ERROR,
  /^\s+at\s/,
  /^\s*\^+\s*$/,
  /^\s*throw\b/,
  /^file:\/\//,
  /^Node\.js v\d/,
];
const MAX_REPORT_LENGTH = 300;
// Shorter values ("true", "3000") also appear in ordinary text and would be
// replaced in places they don't belong.
const MIN_SCRUBBED_VALUE_LENGTH = 6;
const MAX_NAMED_VARIABLES = 3;

/**
 * The app's own last error message, rewritten for the deployment page: any
 * environment value in it is replaced by "[value of NAME]" (Viewers can read
 * this page but not the Environment page), and the variables it refers to
 * are named. Returns null when the app printed no error.
 *
 * @param {string[]} lines  captured app output, oldest first
 * @param {Record<string, string>} [envVars]  the project's environment
 * @returns {string|null}
 */
export function summarizeAppError(lines, envVars = {}) {
  const message = findAppErrorMessage(lines);
  if (!message) {
    return null;
  }

  const entries = Object.entries(envVars).filter(([name]) => name !== 'PORT');
  const mentioned = entries
    .filter(
      ([name, value]) =>
        new RegExp(`\\b${escapeRegExp(name)}\\b`).test(message) ||
        (value.length >= MIN_SCRUBBED_VALUE_LENGTH && message.includes(value)),
    )
    .map(([name]) => name);

  let scrubbed = message;
  for (const [name, value] of [...entries].sort((a, b) => b[1].length - a[1].length)) {
    if (value.length >= MIN_SCRUBBED_VALUE_LENGTH) {
      scrubbed = scrubbed.replaceAll(value, `[value of ${name}]`);
    }
  }

  const report =
    scrubbed.length > MAX_REPORT_LENGTH ? `${scrubbed.slice(0, MAX_REPORT_LENGTH)}…` : scrubbed;
  return mentioned.length > 0 ? `${report}${describeMentionedVariables(mentioned)}` : report;
}

/**
 * The level an app output line deserves in the deployment log: a structured
 * line keeps its own level, crash output is an error, anything else is info.
 *
 * @param {string} line
 * @returns {'INFO'|'WARN'|'ERROR'}
 */
export function classifyAppLine(line) {
  const level = parseJsonLine(line)?.level;
  if (typeof level === 'number') {
    return level >= 50 ? 'ERROR' : level >= 40 ? 'WARN' : 'INFO';
  }
  if (typeof level === 'string') {
    const name = level.toLowerCase();
    return name === 'error' || name === 'fatal' ? 'ERROR' : name === 'warn' ? 'WARN' : 'INFO';
  }
  return CRASH_OUTPUT.some((pattern) => pattern.test(line)) ? 'ERROR' : 'INFO';
}

/**
 * A restarting app prints the same crash once per attempt. Keep the first
 * copy of each line, in order, and report how many times the most repeated
 * line appeared.
 *
 * @param {string[]} lines
 * @returns {{ lines: string[], repeats: number }}
 */
export function collapseRepeatedLines(lines) {
  const counts = new Map();
  for (const line of lines) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return { lines: [...counts.keys()], repeats: Math.max(0, ...counts.values()) };
}

function findAppErrorMessage(lines) {
  let found = null;
  for (const line of lines) {
    const json = parseJsonLine(line);
    if (json) {
      const message = json.msg ?? json.message;
      if (classifyAppLine(line) === 'ERROR' && typeof message === 'string' && message.trim()) {
        found = message.trim();
      }
      continue;
    }
    const thrown = line.match(THROWN_ERROR);
    if (thrown) {
      // A plain "Error:" adds nothing for the owner; a specific type does.
      found = thrown[1] === 'Error' ? thrown[2].trim() : `${thrown[1]}: ${thrown[2].trim()}`;
    }
  }
  return found;
}

function parseJsonLine(line) {
  if (!line.trimStart().startsWith('{')) {
    return null;
  }
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function describeMentionedVariables(names) {
  const shown = names.slice(0, MAX_NAMED_VARIABLES);
  const list =
    shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
  return shown.length === 1
    ? ` (This refers to ${list}, one of your environment variables. Check its value on the Environment page.)`
    : ` (This refers to ${list}, which are environment variables. Check their values on the Environment page.)`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
