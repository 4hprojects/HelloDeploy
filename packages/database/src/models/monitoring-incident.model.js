import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * An operational incident raised by the deterministic alert rules. One open
 * incident exists per fingerprint (scope + rule + resource): repeated
 * breaches update it instead of creating duplicates. Acknowledging records
 * that someone is on it; only the rule recovering resolves it.
 */
const monitoringIncidentSchema = new Schema(
  {
    fingerprint: { type: String, required: true, maxlength: 200 },
    rule: { type: String, required: true, maxlength: 60 },
    scope: { type: String, required: true, maxlength: 20 },
    entityId: { type: String, default: null, maxlength: 64 },
    entityLabel: { type: String, default: null, maxlength: 120 },
    href: { type: String, default: null, maxlength: 300 },
    severity: { type: String, enum: ['critical', 'warning', 'info'], required: true },
    state: { type: String, enum: ['active', 'acknowledged', 'resolved'], required: true },
    title: { type: String, required: true, maxlength: 200 },
    detail: { type: String, default: null, maxlength: 400 },
    firstSeen: { type: Date, required: true },
    lastSeen: { type: Date, required: true },
    // Breach episodes folded into this incident, including re-breaches soon
    // after a recovery, so a flapping condition reads as one problem.
    occurrences: { type: Number, default: 1, min: 1 },
    measurement: {
      value: { type: Number, default: null },
      unit: { type: String, default: null },
      threshold: { type: Number, default: null },
    },
    policyRevision: { type: Number, default: 0 },
    acknowledgedAt: { type: Date, default: null },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    resolution: { type: String, enum: ['recovered', 'cleared', null], default: null },
    // Set when resolved; resolved incidents are kept for review, then expire.
    expiresAt: { type: Date, default: null },
  },
  { collection: 'monitoring_incidents', timestamps: true },
);

monitoringIncidentSchema.index(
  { fingerprint: 1 },
  { unique: true, partialFilterExpression: { state: { $in: ['active', 'acknowledged'] } } },
);
monitoringIncidentSchema.index({ state: 1, severity: 1, lastSeen: -1 });
monitoringIncidentSchema.index({ fingerprint: 1, resolvedAt: -1 });
monitoringIncidentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MonitoringIncident =
  mongoose.models.MonitoringIncident ??
  mongoose.model('MonitoringIncident', monitoringIncidentSchema);
