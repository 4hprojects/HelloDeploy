import mongoose from 'mongoose';
import { QuotaScope } from '@hellodeploy/contracts';

const { Schema } = mongoose;

const quotaSchema = new Schema(
  {
    scopeType: {
      type: String,
      enum: Object.values(QuotaScope),
      required: true,
    },
    scopeId: { type: Schema.Types.ObjectId, default: null },

    maxOwnedProjects: { type: Number, default: null },
    maxRunningApps: { type: Number, default: null },
    maxProjectMembers: { type: Number, default: null },
    memoryMb: { type: Number, default: null },
    cpuCores: { type: Number, default: null },
    storageMb: { type: Number, default: null },
    deploymentsPerMonth: { type: Number, default: null },
    buildTimeoutSeconds: { type: Number, default: null },
    maxCustomDomains: { type: Number, default: null },
    maxRollbackReleases: { type: Number, default: null },
    logRetentionDays: { type: Number, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, default: null, maxlength: 500 },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'quotas',
  },
);

quotaSchema.index({ scopeType: 1, scopeId: 1 });

export const Quota = mongoose.models.Quota ?? mongoose.model('Quota', quotaSchema);
