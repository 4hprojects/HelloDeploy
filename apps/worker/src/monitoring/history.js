import { MonitoringSample } from '@hellodeploy/database';
import { RESOLUTION_SECONDS } from '@hellodeploy/contracts';

const FIELDS = ['cpu', 'mem', 'swap', 'disk', 'rx', 'tx', 'ccpu', 'cmem'];
const ROLLUPS = [
  { from: '1m', to: '5m' },
  { from: '5m', to: '1h' },
  { from: '1h', to: '1d' },
];

/** Bucket start for `time` at `resolution`, in UTC. */
export function bucketStart(time, resolution) {
  const ms = RESOLUTION_SECONDS[resolution] * 1000;
  return new Date(Math.floor(new Date(time).getTime() / ms) * ms);
}

/** How long each tier is kept under the policy, in milliseconds. */
export function retentionMs(policy, resolution) {
  const r = policy.retention;
  return {
    '1m': r.minuteHours * 3_600_000,
    '5m': r.fiveMinuteDays * 86_400_000,
    '1h': r.hourlyDays * 86_400_000,
    '1d': r.dailyDays * 86_400_000,
  }[resolution];
}

/**
 * Summarize points into one bucket: averages weighted by how many raw samples
 * each point covers, maxima of maxima. A field with no numeric value stays
 * absent; it is never averaged in as zero.
 */
export function summarize(points) {
  const bucket = { count: 0 };
  for (const field of FIELDS) {
    let weighted = 0;
    let weight = 0;
    let max = null;
    for (const point of points) {
      const stat = point[field];
      const avg = typeof stat === 'number' ? stat : stat?.avg;
      const peak = typeof stat === 'number' ? stat : stat?.max;
      if (typeof avg !== 'number') {
        continue;
      }
      const w = point.count ?? 1;
      weighted += avg * w;
      weight += w;
      max = max === null ? peak : Math.max(max, peak);
    }
    if (weight > 0) {
      bucket[field] = { avg: Math.round((weighted / weight) * 100) / 100, max };
    }
  }
  bucket.count = points.reduce((total, point) => total + (point.count ?? 1), 0);
  return bucket;
}

/**
 * Turns the collector's raw samples into Mongo history: at most one write per
 * minute for the 1-minute tier, plus a rollup write each time a coarser
 * bucket closes. Raw 15 s samples never reach Mongo.
 */
export function createHistoryWriter({ model = MonitoringSample, logger, now = () => new Date() }) {
  let pending = [];
  let pendingMinute = null;
  let lastRetentionRevision = null;

  async function write(resolution, start, summary, policy) {
    await model.updateOne(
      { resolution, bucketStart: start },
      {
        $set: {
          ...summary,
          expiresAt: new Date(start.getTime() + retentionMs(policy, resolution)),
        },
      },
      { upsert: true },
    );
  }

  async function rollUp(resolution, start, policy) {
    const rollup = ROLLUPS.find((r) => r.to === resolution);
    const end = new Date(start.getTime() + RESOLUTION_SECONDS[resolution] * 1000);
    const parts = await model
      .find({ resolution: rollup.from, bucketStart: { $gte: start, $lt: end } })
      .select('-_id count ' + FIELDS.join(' '))
      .lean();
    if (parts.length > 0) {
      await write(resolution, start, summarize(parts), policy);
    }
  }

  /**
   * A shortened retention removes history already older than the new limit;
   * new buckets carry the new expiry anyway. Only monitoring aggregates are
   * ever deleted here.
   */
  async function applyRetention(policy) {
    if (lastRetentionRevision === policy.revision) {
      return;
    }
    lastRetentionRevision = policy.revision;
    const at = now().getTime();
    await Promise.all(
      Object.keys(RESOLUTION_SECONDS).map((resolution) =>
        model.deleteMany({
          resolution,
          bucketStart: { $lt: new Date(at - retentionMs(policy, resolution)) },
        }),
      ),
    );
  }

  /** Feed one raw sample; writes happen when its minute (and coarser buckets) close. */
  async function record(sample, policy) {
    await applyRetention(policy);
    const minute = bucketStart(sample.t, '1m');
    if (pendingMinute && minute.getTime() !== pendingMinute.getTime() && pending.length > 0) {
      const closed = pendingMinute;
      await write('1m', closed, summarize(pending), policy);
      // A coarser bucket closes when the new minute starts a new one.
      for (const { to } of ROLLUPS) {
        const closedBucket = bucketStart(closed, to);
        if (bucketStart(minute, to).getTime() !== closedBucket.getTime()) {
          await rollUp(to, closedBucket, policy);
        }
      }
      pending = [];
    }
    pendingMinute = minute;
    pending.push(sample);
  }

  return {
    async record(sample, policy) {
      try {
        await record(sample, policy);
      } catch (error) {
        logger?.warn('Monitoring: history write failed', { error: error.message });
      }
    },
  };
}
