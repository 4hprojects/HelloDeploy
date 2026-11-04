import { MonitoringSample } from '@hellodeploy/database';
import { HISTORY_RANGES, RESOLUTION_SECONDS } from '@hellodeploy/contracts';

const FIELDS = ['cpu', 'mem', 'swap', 'disk', 'rx', 'tx', 'ccpu', 'cmem'];
// The widest range at the coarsest tier is 30 daily buckets; a 24h range at
// 5 minutes is 288. Nothing larger is ever read.
const MAX_POINTS = 800;

/**
 * Recorded history for a range, as chart points (bucket averages). Ranges up
 * to an hour come from the raw Redis samples instead; see snapshot.service.
 */
export async function getHistory(rangeKey, { now = new Date() } = {}) {
  const range = HISTORY_RANGES[rangeKey];
  if (!range || range.resolution === 'raw') {
    return null;
  }
  const start = new Date(now.getTime() - range.seconds * 1000);
  const docs = await MonitoringSample.find({
    resolution: range.resolution,
    bucketStart: { $gte: start, $lte: now },
  })
    .select(`-_id bucketStart count ${FIELDS.join(' ')}`)
    .sort({ bucketStart: 1 })
    .limit(MAX_POINTS)
    .lean();
  return {
    resolution: range.resolution,
    stepSeconds: RESOLUTION_SECONDS[range.resolution],
    start: start.getTime(),
    end: now.getTime(),
    points: docs.map((doc) => {
      const point = { t: doc.bucketStart.toISOString(), count: doc.count };
      for (const field of FIELDS) {
        point[field] = doc[field]?.avg ?? null;
        point[`${field}Max`] = doc[field]?.max ?? null;
      }
      return point;
    }),
  };
}
