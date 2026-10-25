import { readdir, readFile, statfs } from 'node:fs/promises';

const BYTES_PER_MB = 1024 * 1024;
const SYSTEM_SLICE = '/sys/fs/cgroup/system.slice';
// Docker's systemd cgroup driver puts each container in its own scope here.
const CONTAINER_SCOPE = /^docker-[0-9a-f]{64}\.scope$/;
const BYTES_PER_GB = 1024 * BYTES_PER_MB;

/**
 * Read what admission and monitoring compare against: host memory, swap,
 * memory pressure, free disk, and the builder's own cgroup usage. Readings that
 * cannot be taken come back as NaN or null, which the admission and pressure
 * checks treat as failures, so a broken reading never admits a build.
 *
 * @param {{ workspacePath: string, storePath: string, unit: string }} paths
 */
export async function readHostResources(
  { workspacePath, storePath, unit },
  deps = { readdir, readFile, statfs },
) {
  const [
    meminfo,
    pressure,
    diskFreeGb,
    storeFreeGb,
    builderMemoryMb,
    builderPressure,
    appPressureFull10,
  ] = await Promise.all([
    deps.readFile('/proc/meminfo', 'utf8').then(parseMeminfo, () => null),
    deps.readFile('/proc/pressure/memory', 'utf8').then(parseMemoryPressure, () => null),
    readFreeGb(workspacePath, deps),
    readFreeGb(storePath, deps),
    deps.readFile(`/sys/fs/cgroup/system.slice/${unit}/memory.current`, 'utf8').then(
      (text) => Math.round(Number(text.trim()) / BYTES_PER_MB),
      () => null,
    ),
    deps
      .readFile(`${SYSTEM_SLICE}/${unit}/memory.pressure`, 'utf8')
      .then(parseMemoryPressure, () => null),
    readAppPressureFull10(deps),
  ]);
  return {
    memAvailableMb: meminfo?.memAvailableMb ?? NaN,
    swapTotalMb: meminfo?.swapTotalMb ?? NaN,
    swapFreeMb: meminfo?.swapFreeMb ?? NaN,
    memoryPressureSome60: pressure?.some60 ?? NaN,
    memoryPressureFull10: pressure?.full10 ?? NaN,
    // Without readable app containers, the system-wide value stands in.
    appMemoryPressureFull10: appPressureFull10 ?? pressure?.full10 ?? NaN,
    builderMemoryPressureFull10: builderPressure?.full10 ?? NaN,
    diskFreeGb: diskFreeGb ?? NaN,
    storeFreeGb,
    builderMemoryMb,
    sampledAt: new Date().toISOString(),
  };
}

export function parseMeminfo(text) {
  const values = {};
  for (const line of text.split('\n')) {
    const match = /^(\w+):\s+(\d+)\s*kB/.exec(line);
    if (match) {
      values[match[1]] = Number(match[2]);
    }
  }
  if (!Number.isFinite(values.MemAvailable)) {
    return null;
  }
  return {
    memAvailableMb: Math.round(values.MemAvailable / 1024),
    swapTotalMb: Math.round((values.SwapTotal ?? 0) / 1024),
    swapFreeMb: Math.round((values.SwapFree ?? 0) / 1024),
  };
}

/** The `some avg60` and `full avg10` percentages from /proc/pressure/memory. */
export function parseMemoryPressure(text) {
  const some = /^some avg10=[\d.]+ avg60=([\d.]+)/m.exec(text);
  const full = /^full avg10=([\d.]+)/m.exec(text);
  if (!some || !full) {
    return null;
  }
  return { some60: Number(some[1]), full10: Number(full[1]) };
}

async function readFreeGb(path, deps) {
  try {
    const stats = await deps.statfs(path);
    return Math.floor((Number(stats.bavail) * Number(stats.bsize)) / BYTES_PER_GB);
  } catch {
    return null;
  }
}

/**
 * The highest `full avg10` memory pressure among the running containers, or
 * null when no container cgroup can be read.
 */
async function readAppPressureFull10(deps) {
  let entries;
  try {
    entries = await deps.readdir(SYSTEM_SLICE);
  } catch {
    return null;
  }
  const values = await Promise.all(
    entries
      .filter((name) => CONTAINER_SCOPE.test(name))
      .map((name) =>
        deps.readFile(`${SYSTEM_SLICE}/${name}/memory.pressure`, 'utf8').then(
          (text) => parseMemoryPressure(text)?.full10 ?? null,
          () => null,
        ),
      ),
  );
  const readable = values.filter((value) => value !== null);
  return readable.length > 0 ? Math.max(...readable) : null;
}
