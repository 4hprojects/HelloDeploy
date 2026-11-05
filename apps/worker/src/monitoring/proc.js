import { readFile, statfs } from 'node:fs/promises';

import { parseMemoryPressure } from '../builder/host-resources.js';

// Virtual and per-container interfaces carry the same bytes as the physical
// link (or never leave the host), so counting them would double host traffic.
const VIRTUAL_INTERFACE = /^(lo|veth|docker|br-|virbr|cni|flannel|cali|vxlan|tun|tap|wg)/;

/** Aggregate CPU jiffies from the first line of /proc/stat, or null. */
export function parseProcStat(text) {
  const line = String(text ?? '')
    .split('\n')
    .find((row) => row.startsWith('cpu '));
  if (!line) {
    return null;
  }
  const fields = line.trim().split(/\s+/).slice(1).map(Number);
  if (fields.length < 4 || fields.some((value) => !Number.isFinite(value))) {
    return null;
  }
  // user nice system idle iowait irq softirq steal (guest time is already in user).
  const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = fields;
  const idleAll = idle + iowait;
  const total = user + nice + system + idleAll + irq + softirq + steal;
  return { total, idle: idleAll, iowait };
}

/**
 * Host CPU utilization between two /proc/stat samples, as a percentage of all
 * cores together (100% = every core busy). Null when there is no usable delta.
 */
export function computeCpuUtilization(previous, current) {
  if (!previous || !current) {
    return null;
  }
  const total = current.total - previous.total;
  const idle = current.idle - previous.idle;
  if (!(total > 0) || idle < 0 || idle > total) {
    return null;
  }
  return round(((total - idle) / total) * 100, 1);
}

/** MemTotal, MemAvailable and swap from /proc/meminfo in bytes, or null. */
export function parseMemoryInfo(text) {
  const values = {};
  for (const line of String(text ?? '').split('\n')) {
    const match = /^(\w+):\s+(\d+)\s*kB/.exec(line);
    if (match) {
      values[match[1]] = Number(match[2]) * 1024;
    }
  }
  if (!Number.isFinite(values.MemTotal) || !Number.isFinite(values.MemAvailable)) {
    return null;
  }
  const swapTotal = values.SwapTotal ?? 0;
  return {
    totalBytes: values.MemTotal,
    availableBytes: values.MemAvailable,
    // "Used" in the operational sense: what applications cannot get back.
    // Page cache the kernel can reclaim counts as available, as in `free`.
    usedBytes: values.MemTotal - values.MemAvailable,
    swapTotalBytes: swapTotal,
    swapUsedBytes: swapTotal - (values.SwapFree ?? swapTotal),
  };
}

/** Per-interface byte counters for physical interfaces from /proc/net/dev. */
export function parseNetDev(text) {
  const interfaces = {};
  for (const line of String(text ?? '')
    .split('\n')
    .slice(2)) {
    const match = /^\s*([^:\s]+):\s*(.*)$/.exec(line);
    if (!match || VIRTUAL_INTERFACE.test(match[1])) {
      continue;
    }
    const fields = match[2].trim().split(/\s+/).map(Number);
    if (fields.length >= 9 && Number.isFinite(fields[0]) && Number.isFinite(fields[8])) {
      interfaces[match[1]] = { rx: fields[0], tx: fields[8] };
    }
  }
  return interfaces;
}

/**
 * Bytes per second received and sent between two samples. An interface that
 * is new, vanished, or whose counter went backwards (reset, driver reload) is
 * left out of this interval rather than turned into a negative or huge spike.
 */
export function computeNetworkRates(previous, current, seconds) {
  if (!previous || !current || !(seconds > 0)) {
    return { rxBytesPerSecond: null, txBytesPerSecond: null, resetInterfaces: [] };
  }
  let rx = 0;
  let tx = 0;
  let counted = 0;
  const resetInterfaces = [];
  for (const [name, now] of Object.entries(current.interfaces)) {
    const before = previous.interfaces[name];
    if (!before) {
      continue;
    }
    if (now.rx < before.rx || now.tx < before.tx) {
      resetInterfaces.push(name);
      continue;
    }
    rx += now.rx - before.rx;
    tx += now.tx - before.tx;
    counted += 1;
  }
  if (counted === 0) {
    return { rxBytesPerSecond: null, txBytesPerSecond: null, resetInterfaces };
  }
  return {
    rxBytesPerSecond: Math.round(rx / seconds),
    txBytesPerSecond: Math.round(tx / seconds),
    resetInterfaces,
  };
}

export function parseLoadavg(text) {
  const [load1, load5, load15] = String(text ?? '')
    .trim()
    .split(/\s+/)
    .map(Number);
  return [load1, load5, load15].every(Number.isFinite) ? { load1, load5, load15 } : null;
}

export function parseUptime(text) {
  const seconds = Number(String(text ?? '').split(/\s+/)[0]);
  return Number.isFinite(seconds) ? Math.floor(seconds) : null;
}

/** Filesystem capacity in bytes; `available` is what non-root writers can still use. */
export async function readFilesystem(path, deps = { statfs }) {
  const stats = await deps.statfs(path);
  const block = Number(stats.bsize);
  const totalBytes = Number(stats.blocks) * block;
  const freeBytes = Number(stats.bfree) * block;
  const availableBytes = Number(stats.bavail) * block;
  const usedBytes = totalBytes - freeBytes;
  const inodes = Number(stats.files);
  const inodesFree = Number(stats.ffree);
  return {
    totalBytes,
    usedBytes,
    availableBytes,
    // Matches df: used / (used + available), so the root reserve counts as full.
    usedPercent:
      usedBytes + availableBytes > 0
        ? round((usedBytes / (usedBytes + availableBytes)) * 100, 1)
        : null,
    inodesUsedPercent: inodes > 0 ? round(((inodes - inodesFree) / inodes) * 100, 1) : null,
  };
}

/** One read of every host counter the collector needs; unreadable files come back null. */
export async function readHostCounters(deps = { readFile }) {
  const read = (path) => deps.readFile(path, 'utf8').catch(() => null);
  const [stat, meminfo, pressure, netdev, loadavg, uptime] = await Promise.all([
    read('/proc/stat'),
    read('/proc/meminfo'),
    read('/proc/pressure/memory'),
    read('/proc/net/dev'),
    read('/proc/loadavg'),
    read('/proc/uptime'),
  ]);
  return {
    cpu: parseProcStat(stat),
    memory: parseMemoryInfo(meminfo),
    pressure: pressure ? parseMemoryPressure(pressure) : null,
    interfaces: netdev ? parseNetDev(netdev) : null,
    load: parseLoadavg(loadavg),
    uptimeSeconds: parseUptime(uptime),
  };
}

export function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
