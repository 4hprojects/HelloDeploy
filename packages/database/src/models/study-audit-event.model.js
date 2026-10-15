import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Anonymized copy of a project audit event, kept indefinitely for long-term
 * study after the raw event expires (90 days). It holds no user, project,
 * IP, user agent, name, email, hostname or secret name. `studyId` is a hash
 * of the project's random studyKey and the event id, and `studyProjectKey` is
 * that studyKey, so deleting the project leaves nothing that links these rows
 * back to it.
 */
const studyAuditEventSchema = new Schema(
  {
    studyId: { type: String, required: true },
    studyProjectKey: { type: String, required: true },
    action: { type: String, required: true, maxlength: 200 },
    outcome: { type: String, required: true },
    // system | member | admin | other: who acted, without saying who.
    actorKind: { type: String, required: true },
    actorProjectRole: { type: String, default: null },
    day: { type: Date, required: true },
    hourOfDay: { type: Number, required: true, min: 0, max: 23 },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  {
    timestamps: true,
    collection: 'study_audit_events',
  },
);

studyAuditEventSchema.index({ studyId: 1 }, { unique: true });
studyAuditEventSchema.index({ day: 1 });
studyAuditEventSchema.index({ studyProjectKey: 1, day: 1 });

export const StudyAuditEvent =
  mongoose.models.StudyAuditEvent ?? mongoose.model('StudyAuditEvent', studyAuditEventSchema);
