import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MONITORING_POLICY_DEFAULTS,
  createMetric,
  diffMonitoringPolicy,
  getFreshness,
  normalizeDashboardPreferences,
  normalizeMonitoringPolicy,
  validateDashboardPreferencesInput,
  validateMonitoringPolicyInput,
} from '@hellodeploy/contracts';

/** A complete, valid platform policy form as the settings page submits it. */
function policyForm(overrides = {}) {
  const d = MONITORING_POLICY_DEFAULTS;
  const form = {
    revision: '0',
    memoryPressureCritical: String(d.memoryPressureCritical),
    'probes.failuresBeforeUnhealthy': '3',
    'probes.successesBeforeHealthy': '2',
  };
  for (const [key, value] of Object.entries(d.intervals)) {
    form[`intervals.${key}`] = String(value);
  }
  for (const [rule, values] of Object.entries(d.thresholds)) {
    for (const [part, value] of Object.entries(values)) {
      form[`thresholds.${rule}.${part}`] = String(value);
    }
  }
  for (const [key, value] of Object.entries(d.retention)) {
    form[`retention.${key}`] = String(value);
  }
  for (const [key, value] of Object.entries(d.capacity)) {
    form[`capacity.${key}`] = String(value);
  }
  for (const [key, value] of Object.entries(d.collectors)) {
    form[`collectors.${key}`] = value ? ['false', 'true'] : 'false';
  }
  return { ...form, ...overrides };
}

describe('dashboard preferences', () => {
  it('gives an account that never saved preferences the compact defaults', () => {
    assert.deepEqual(normalizeDashboardPreferences(undefined), {
      sidebarCollapsed: false,
      density: 'compact',
      hiddenWidgets: [],
      historyRange: '1h',
      refreshSeconds: 15,
      tableRows: 25,
    });
  });

  it('drops a stored widget that no longer exists instead of failing', () => {
    const prefs = normalizeDashboardPreferences({ hiddenWidgets: ['apps', 'retired-panel'] });
    assert.deepEqual(prefs.hiddenWidgets, ['apps']);
  });

  it('rejects a refresh interval that is not offered', () => {
    const result = validateDashboardPreferencesInput({
      density: 'compact',
      historyRange: '1h',
      refreshSeconds: '5',
      tableRows: '25',
    });
    assert.ok(result.errors.refreshSeconds);
  });

  it('cannot hide the incident strip or the key indicators', () => {
    const result = validateDashboardPreferencesInput({
      density: 'compact',
      historyRange: '1h',
      refreshSeconds: '15',
      tableRows: '25',
      visibleWidgets: ['apps', 'kpis'],
    });
    assert.ok(result.errors.visibleWidgets);
  });

  it('turns unchecked panels into the hidden list', () => {
    const result = validateDashboardPreferencesInput({
      density: 'spacious',
      historyRange: '6h',
      refreshSeconds: '0',
      tableRows: '50',
      visibleWidgets: [
        'apps',
        'consumers',
        'services',
        'trends',
        'capacity',
        'deployments',
        'attention',
      ],
    });
    assert.deepEqual(result.value.hiddenWidgets, ['activity']);
  });
});

describe('platform monitoring policy validation', () => {
  it('accepts the defaults as submitted by the form', () => {
    assert.equal(validateMonitoringPolicyInput(policyForm()).ok, true);
  });

  it('rejects a warning threshold at or above critical', () => {
    const result = validateMonitoringPolicyInput(
      policyForm({ 'thresholds.cpu.warning': '95', 'thresholds.cpu.critical': '95' }),
    );
    assert.ok(result.errors['thresholds.cpu.warning']);
  });

  it('rejects a recovery level that would let an alert flap', () => {
    const result = validateMonitoringPolicyInput(policyForm({ 'thresholds.memory.clear': '80' }));
    assert.ok(result.errors['thresholds.memory.clear']);
  });

  it('rejects collection faster than the system minimum', () => {
    const result = validateMonitoringPolicyInput(policyForm({ 'intervals.resourceSeconds': '5' }));
    assert.ok(result.errors['intervals.resourceSeconds']);
  });

  it('rejects retention beyond the storage cap', () => {
    const result = validateMonitoringPolicyInput(policyForm({ 'retention.dailyDays': '365' }));
    assert.ok(result.errors['retention.dailyDays']);
  });

  it('rejects a negative retention', () => {
    const result = validateMonitoringPolicyInput(policyForm({ 'retention.minuteHours': '-1' }));
    assert.ok(result.errors['retention.minuteHours']);
  });

  it('rejects keeping coarse history for less time than fine history', () => {
    const result = validateMonitoringPolicyInput(
      policyForm({ 'retention.fiveMinuteDays': '14', 'retention.hourlyDays': '7' }),
    );
    assert.ok(result.errors['retention.hourlyDays']);
  });

  it('rejects a fractional interval', () => {
    const result = validateMonitoringPolicyInput(policyForm({ 'intervals.diskSeconds': '30.5' }));
    assert.ok(result.errors['intervals.diskSeconds']);
  });

  it('reads a checked collector from the hidden-plus-checkbox pair', () => {
    const result = validateMonitoringPolicyInput(
      policyForm({ 'collectors.publicReachability': ['false', 'true'] }),
    );
    assert.equal(result.value.collectors.publicReachability, true);
  });

  it('starts a notification mute that ends after the chosen minutes', () => {
    const now = new Date('2026-11-05T00:00:00Z');
    const result = validateMonitoringPolicyInput(
      policyForm({ 'notifications.muteMinutes': '60' }),
      { now },
    );
    assert.equal(result.value.notifications.muteUntil, '2026-11-05T01:00:00.000Z');
  });

  it('keeps a running mute when the mute field is left alone', () => {
    const now = new Date('2026-11-05T00:00:00Z');
    const current = normalizeMonitoringPolicy({
      notifications: { muteUntil: '2026-11-05T02:00:00Z', muteReason: 'upgrade' },
    });
    const form = policyForm();
    delete form['notifications.muteReason'];
    const result = validateMonitoringPolicyInput(form, { now, current });
    assert.equal(result.value.notifications.muteUntil, '2026-11-05T02:00:00.000Z');
  });

  it('caps a mute at seven days', () => {
    const result = validateMonitoringPolicyInput(
      policyForm({ 'notifications.muteMinutes': String(8 * 24 * 60) }),
    );
    assert.ok(result.errors['notifications.muteMinutes']);
  });
});

describe('stored policy normalization', () => {
  it('replaces an inconsistent stored rule with its defaults', () => {
    const policy = normalizeMonitoringPolicy({
      thresholds: { disk: { warning: 95, critical: 90, clear: 10, sustainSeconds: 60 } },
    });
    assert.deepEqual(policy.thresholds.disk, MONITORING_POLICY_DEFAULTS.thresholds.disk);
  });

  it('lists only the settings that changed for the audit record', () => {
    const before = normalizeMonitoringPolicy(null);
    const after = normalizeMonitoringPolicy({ intervals: { resourceSeconds: 30 } });
    assert.deepEqual(diffMonitoringPolicy(before, after), {
      'intervals.resourceSeconds': { from: 15, to: 30 },
    });
  });
});

describe('metric envelope', () => {
  it('records a missing reading as null with a reason, never zero', () => {
    const metric = createMetric({ key: 'host.cpu', value: Number.NaN, unit: '%', scope: 'host' });
    assert.deepEqual(
      [metric.value, metric.freshness, metric.reason],
      [null, 'unavailable', 'No reading'],
    );
  });

  it('keeps a genuine zero reading', () => {
    const metric = createMetric({ key: 'host.net.rx', value: 0, unit: 'B/s', scope: 'host' });
    assert.equal(metric.value, 0);
  });

  it('marks a reading stale once it is older than two intervals', () => {
    const now = Date.parse('2026-11-05T00:01:00Z');
    assert.equal(getFreshness('2026-11-05T00:00:29Z', 15, now), 'stale');
  });

  it('treats a reading inside two intervals as fresh', () => {
    const now = Date.parse('2026-11-05T00:01:00Z');
    assert.equal(getFreshness('2026-11-05T00:00:40Z', 15, now), 'fresh');
  });
});
