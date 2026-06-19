import { redactObject } from '@hellodeploy/security';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const ENV_LEVEL =
  process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const ACTIVE_LEVEL = LEVELS[ENV_LEVEL] ?? LEVELS.info;

function write(level, message, meta) {
  if ((LEVELS[level] ?? 99) > ACTIVE_LEVEL) {
    return;
  }

  const entry = {
    level,
    time: new Date().toISOString(),
    msg: message,
  };

  if (meta !== undefined && meta !== null) {
    entry.meta = redactObject(meta);
  }

  const line = JSON.stringify(entry);

  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  error: (msg, meta) => write('error', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  debug: (msg, meta) => write('debug', msg, meta),

  child: (defaultMeta) => ({
    error: (msg, meta) => write('error', msg, { ...defaultMeta, ...meta }),
    warn: (msg, meta) => write('warn', msg, { ...defaultMeta, ...meta }),
    info: (msg, meta) => write('info', msg, { ...defaultMeta, ...meta }),
    debug: (msg, meta) => write('debug', msg, { ...defaultMeta, ...meta }),
  }),
};
