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
    // The project an event belongs to, so each project can read its own log.
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
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
      validate: {
        validator(value) {
          if (value === null || value === undefined) {
            return true;
          }
          return JSON.stringify(value).length <= 10_000;
        },
        message: 'metadata must not exceed 10,000 serialized characters.',
      },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // No updates to audit events
    collection: 'audit_events',
  },
);

auditEventSchema.index({ actorId: 1, createdAt: -1 });
auditEventSchema.index({ action: 1, createdAt: -1 });
auditEventSchema.index({ outcome: 1, createdAt: -1 });
auditEventSchema.index({ targetType: 1, createdAt: -1 });
auditEventSchema.index({ targetId: 1, createdAt: -1 });
auditEventSchema.index({ correlationId: 1 });
auditEventSchema.index({ projectId: 1, createdAt: -1 });
// 90-day retention, as the privacy policy states. Changing this value needs
// scripts/repair-audit-retention.js: Mongoose never alters an existing TTL.
export const AUDIT_EVENT_RETENTION_SECONDS = 90 * 24 * 60 * 60;
auditEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: AUDIT_EVENT_RETENTION_SECONDS });

export const AuditEvent =
  mongoose.models.AuditEvent ?? mongoose.model('AuditEvent', auditEventSchema);
