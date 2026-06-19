import mongoose from 'mongoose';
import { DomainStatus, DomainType } from '@hellodeploy/contracts';

const { Schema } = mongoose;

const domainSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    hostnameNormalized: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 253,
    },
    type: {
      type: String,
      enum: Object.values(DomainType),
      default: DomainType.CUSTOM,
    },
    status: {
      type: String,
      enum: Object.values(DomainStatus),
      default: DomainStatus.PENDING_VERIFICATION,
    },
    // SHA-256 hash of the verification token shown to the user
    verificationTokenHash: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    // Admin who approved the domain
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    // Reason for rejection if applicable
    rejectionReason: { type: String, default: null, maxlength: 500 },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    removedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'domains',
  },
);

// Unique per hostname (prevents duplicate claims across all projects)
domainSchema.index({ hostnameNormalized: 1 }, { unique: true });
domainSchema.index({ projectId: 1 });
domainSchema.index({ status: 1 });

export const Domain = mongoose.models.Domain ?? mongoose.model('Domain', domainSchema);
