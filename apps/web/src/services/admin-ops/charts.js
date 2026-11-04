/**
 * Server-side geometry for the overview's inline SVG charts, so the browser
 * only swaps markup. Missing samples and collection gaps break the line: a
 * gap is drawn as a gap, never bridged or filled with zeros.
 */

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 200;

/**
 * @param {Array<{t: string}>} samples oldest first
 * @param {{ start: number, end: number, stepSeconds: number,
 *   series: Array<{key: string, label: string, unit: string, max?: number}> }} options
 */
export function buildLineChart(samples, { start, end, stepSeconds, series }) {
  const span = Math.max(1, end - start);
  const points = samples
    .map((sample) => ({ ...sample, at: Date.parse(sample.t) }))
    .filter((sample) => Number.isFinite(sample.at) && sample.at >= start && sample.at <= end);
  const gapMs = stepSeconds * 2500;
  let gaps = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].at - points[i - 1].at > gapMs) {
      gaps += 1;
    }
  }

  // One axis per chart: every series shares the scale, so heights compare.
  const allValues = series.flatMap((definition) =>
    points.map((p) => p[definition.key]).filter((v) => typeof v === 'number'),
  );
  const sharedMax =
    series.find((definition) => definition.max)?.max ??
    niceCeiling(allValues.length > 0 ? Math.max(...allValues) : 0);

  const lines = series.map((definition) => {
    const values = points.map((p) => p[definition.key]).filter((v) => typeof v === 'number');
    const observedMax = values.length > 0 ? Math.max(...values) : 0;
    const max = sharedMax;
    const segments = [];
    let current = [];
    let previousAt = null;
    for (const point of points) {
      const value = point[definition.key];
      const broken = previousAt !== null && point.at - previousAt > gapMs;
      if (typeof value !== 'number' || broken) {
        if (current.length > 0) {
          segments.push(current);
        }
        current = [];
      }
      if (typeof value === 'number') {
        const x = ((point.at - start) / span) * VIEW_WIDTH;
        const y = VIEW_HEIGHT - (Math.min(value, max) / (max || 1)) * VIEW_HEIGHT;
        current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      previousAt = point.at;
    }
    if (current.length > 0) {
      segments.push(current);
    }
    return {
      key: definition.key,
      label: definition.label,
      unit: definition.unit,
      max,
      segments: segments.map((segment) => segment.join(' ')),
      latest: values.at(-1) ?? null,
      min: values.length > 0 ? Math.min(...values) : null,
      peak: values.length > 0 ? observedMax : null,
      average: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null,
      count: values.length,
    };
  });

  return {
    viewBox: `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    sampleCount: points.length,
    gaps,
    lines,
    hasData: lines.some((line) => line.count > 0),
  };
}

/** Compact sparkline points in a 100×24 box, or null with fewer than two values. */
export function buildSparkline(values, max = 100) {
  const numeric = values.filter((v) => typeof v === 'number');
  if (numeric.length < 2) {
    return null;
  }
  const top = max ?? niceCeiling(Math.max(...numeric));
  const step = 100 / (values.length - 1);
  const parts = [];
  values.forEach((value, index) => {
    if (typeof value === 'number') {
      parts.push(
        `${(index * step).toFixed(1)},${(24 - (Math.min(value, top) / (top || 1)) * 22 - 1).toFixed(1)}`,
      );
    }
  });
  return { points: parts.join(' ') };
}

function niceCeiling(value) {
  if (!(value > 0)) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    if (value <= multiple * magnitude) {
      return multiple * magnitude;
    }
  }
  return 10 * magnitude;
}
