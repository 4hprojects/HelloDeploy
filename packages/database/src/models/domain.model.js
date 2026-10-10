import mongoose from 'mongoose';
import {
  DomainConnectionMode,
  DomainRoutingState,
  DomainStatus,
  DomainType,
} from '@hellodeploy/contracts';

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
    lifecycleVersion: { type: Number, default: 1, min: 1 },
    operationId: { type: String, default: null, maxlength: 100 },
    operationError: { type: String, default: null, maxlength: 500 },
    operationStartedAt: { type: Date, default: null },
    operationCompletedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    // Cloudflare tunnel carrying this hostname. Recorded by an administrator
    // after `cloudflared tunnel create`; the owner points a CNAME at
    // <tunnelId>.cfargotunnel.com.
    tunnelId: { type: String, default: null, maxlength: 100 },
    // AUTOMATIC when the platform established public routing itself; MANUAL
    // when the zone sits in an account it cannot reach and the owner must
    // publish the CNAME by hand.
    connectionMode: {
      type: String,
      enum: Object.values(DomainConnectionMode),
      default: DomainConnectionMode.PENDING,
    },
    // Result of the last end-to-end reachability probe. Nginx routing being
    // ACTIVE says nothing about whether public DNS reaches this platform.
    routingState: {
      type: String,
      enum: Object.values(DomainRoutingState),
      default: DomainRoutingState.UNKNOWN,
    },
    routingCheckedAt: { type: Date, default: null },
    routingDetail: { type: String, default: null, maxlength: 200 },
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
