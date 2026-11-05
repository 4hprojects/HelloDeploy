import { ContainerRole, MetricFreshness } from '@hellodeploy/contracts';

/**
 * Capacity under policy, from the collector snapshot. Four quantities are
 * kept apart and never substituted for one another:
 * - physical capacity (what the host has),
 * - actual use (what is consumed now),
 * - allocated limits (the memory and CPU limits Docker enforces on live
 *   releases; configured, not used),
 * - the policy reserve (held back for the OS, platform and builds).
 * Nothing here estimates how many more apps would fit.
 */
export function buildCapacity(snapshotState, policy) {
  const snapshot = snapshotState?.snapshot;
  if (!snapshot) {
    return { available: false, reason: snapshotState?.reason ?? 'No collector snapshot' };
  }
  const value = (key) => snapshot.metrics?.find((m) => m.key === key)?.value ?? null;
  const live = (snapshot.containers ?? []).filter(
    (c) => c.running && [ContainerRole.ACTIVE, ContainerRole.CANDIDATE].includes(c.role),
  );
  const limited = live.filter((c) => c.memoryLimitBytes);
  const reserve = policy.capacity;

  const total = value('host.memory.total');
  const used = value('host.memory.used');
  const availableNow = value('host.memory.available');
  let memory = null;
  if (total !== null && used !== null && availableNow !== null) {
    const allocated = limited.reduce((sum, c) => sum + c.memoryLimitBytes, 0);
    const appUse = live.reduce((sum, c) => sum + (c.memoryBytes ?? 0), 0);
    const reserveBytes = Math.round((total * reserve.memoryReservePercent) / 100);
    // Everything the apps do not account for: kernel, platform services,
    // databases and other software on the host.
    const otherUse = Math.max(0, used - appUse);
    const allocatable = total - reserveBytes - otherUse;
    const buildMb = snapshot.worker?.buildMemoryMb;
    const buildBytes = buildMb ? buildMb * 1048576 : null;
    memory = {
      total,
      used,
      appUse,
      otherUse,
      availableNow,
      reserveBytes,
      allocated,
      allocatable,
      unallocated: allocatable - allocated,
      overcommitted: allocated > allocatable,
      overcommitRatio: allocatable > 0 ? Math.round((allocated / allocatable) * 100) / 100 : null,
      headroomNow: availableNow - reserveBytes,
      reserveBreached: availableNow < reserveBytes,
      buildBytes,
      roomForBuildNow: buildBytes ? availableNow - reserveBytes >= buildBytes : null,
    };
  }

  const cores = value('host.cpu.cores');
  const utilization = value('host.cpu.utilization');
  const cpu = cores
    ? {
        cores,
        utilization,
        reservePercent: reserve.cpuReservePercent,
        allocatedCores:
          Math.round(live.reduce((sum, c) => sum + (c.cpuLimitCores ?? 0), 0) * 100) / 100,
        unlimited: live.filter((c) => !c.cpuLimitCores).length,
        headroomPercent:
          utilization === null
            ? null
            : Math.round((100 - reserve.cpuReservePercent - utilization) * 10) / 10,
      }
    : null;
  if (cpu) {
    // CPU limits are ceilings on a shared, compressible resource: summing
    // past the core count means contention under load, not failure.
    cpu.allocatedRatio = Math.round((cpu.allocatedCores / cores) * 100) / 100;
  }

  const root = snapshot.disks?.[0] ?? null;
  const disk = root
    ? {
        label: root.label,
        total: root.totalBytes,
        used: root.usedBytes,
        available: root.availableBytes,
        reserveBytes: Math.round((root.totalBytes * reserve.diskReservePercent) / 100),
        dockerStorage: snapshot.dockerDiskUsage ?? null,
      }
    : null;
  if (disk) {
    disk.headroom = disk.available - disk.reserveBytes;
    disk.reserveBreached = disk.headroom < 0;
  }

  if (memory) {
    const reserveStart = { key: 'reserve', value: memory.reserveBytes };
    memory.useBar = capacityBar(memory.total, [
      { key: 'other', value: memory.otherUse },
      { key: 'apps', value: memory.appUse },
      { key: 'gap', value: Math.max(0, memory.total - memory.used - memory.reserveBytes) },
      reserveStart,
    ]);
    memory.limitBar = capacityBar(memory.total, [
      { key: 'other', value: memory.otherUse },
      { key: 'allocated', value: memory.allocated },
      { key: 'gap', value: Math.max(0, memory.unallocated) },
      reserveStart,
    ]);
  }
  if (cpu && cpu.utilization !== null) {
    cpu.bar = capacityBar(100, [
      { key: 'apps', value: cpu.utilization },
      { key: 'gap', value: Math.max(0, 100 - cpu.utilization - cpu.reservePercent) },
      { key: 'reserve', value: cpu.reservePercent },
    ]);
  }
  if (disk) {
    disk.bar = capacityBar(disk.total, [
      { key: 'other', value: disk.used },
      { key: 'gap', value: Math.max(0, disk.total - disk.used - disk.reserveBytes) },
      { key: 'reserve', value: disk.reserveBytes },
    ]);
  }

  return {
    available: true,
    stale: snapshotState.freshness === MetricFreshness.STALE,
    collectedAt: snapshot.collectedAt,
    liveContainers: live.length,
    unlimitedMemory: live.length - limited.length,
    memory,
    cpu,
    disk,
    remoteBuilder: snapshot.worker?.buildExecutor === 'remote-buildkit',
  };
}

/**
 * Geometry for a horizontal capacity bar: segments as percentages of the
 * physical total, drawn as SVG rects (the CSP forbids inline styles).
 */
export function capacityBar(total, segments) {
  if (!(total > 0)) {
    return [];
  }
  let offset = 0;
  return segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const width = Math.min(100 - offset, (segment.value / total) * 100);
      const rect = { ...segment, x: offset.toFixed(2), width: Math.max(0, width).toFixed(2) };
      offset += Math.max(0, width);
      return rect;
    });
}
