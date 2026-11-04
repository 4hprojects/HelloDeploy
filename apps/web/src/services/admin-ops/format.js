/** Display helpers for the operations overview. Null always renders as Unavailable. */

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return 'Unavailable';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

export function formatPercent(value, digits = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Unavailable';
  }
  return `${value.toFixed(digits)}%`;
}

/** Bits per second, the unit operators compare against link speed. */
export function formatBitRate(bytesPerSecond) {
  if (typeof bytesPerSecond !== 'number' || !Number.isFinite(bytesPerSecond)) {
    return 'Unavailable';
  }
  const bits = bytesPerSecond * 8;
  if (bits >= 1e9) {
    return `${(bits / 1e9).toFixed(2)} Gbps`;
  }
  if (bits >= 1e6) {
    return `${(bits / 1e6).toFixed(1)} Mbps`;
  }
  if (bits >= 1e3) {
    return `${(bits / 1e3).toFixed(0)} kbps`;
  }
  return `${Math.round(bits)} bps`;
}

export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return 'Unavailable';
  }
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  }
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }
  return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3600)}h`;
}

/** healthy / warning / critical against a policy rule, or unknown without a reading. */
export function toneForPercent(value, rule) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'unknown';
  }
  if (rule && value >= rule.critical) {
    return 'critical';
  }
  if (rule && value >= rule.warning) {
    return 'warning';
  }
  return 'healthy';
}
