import mongoose from 'mongoose';
import { AuditOutcome } from '@hellodeploy/contracts';

const { Schema } = mongoose;

// Audit events are append-only and immutable. No updates, no deletes.
// Secret values must never appear in metadata.
const auditEventSchema = new Schema(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null for system/unauthenticated actions
    },
    actorRole: {
      type: String,
      default: null,
    },
    action: {
      type: String,
      required: true,
      maxlength: 200,
    },
    targetType: {
      type: String,
      default: null,
      maxlength: 100,
    },
    targetId: {
      type: String,
      default: null,
      maxlength: 200,
    },
    outcome: {
      type: String,
      enum: Object.values(AuditOutcome),
      required: true,
    },
    sourceIp: {
      type: String,
      default: null,
      maxlength: 45, // IPv6 max
    },
    userAgent: {
      type: String,
      default: null,
      maxlength: 500,
    },
    correlationId: {
      type: String,
      default: null,
      maxlength: 64,
    },
    // Arbitrary metadata — must be redacted before storage (no secret values)
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // No updates to audit events
    collection: 'audit_events',
  },
);

auditEventSchema.index({ actorId: 1, createdAt: -1 });
auditEventSchema.index({ action: 1, createdAt: -1 });
auditEventSchema.index({ correlationId: 1 });
// 7-day retention policy enforced by TTL index (per blueprint)
auditEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const AuditEvent =
  mongoose.models.AuditEvent ?? mongoose.model('AuditEvent', auditEventSchema);
