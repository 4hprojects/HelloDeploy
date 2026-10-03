import mongoose from 'mongoose';
import { PlatformReleaseStatus } from '@hellodeploy/contracts';

const { Schema } = mongoose;

const platformReleaseRequestSchema = new Schema(
  {
    candidateSha: { type: String, required: true, match: /^[a-f0-9]{40}$/ },
    previousSha: { type: String, default: null, match: /^[a-f0-9]{40}$/ },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    activeLock: { type: String, default: 'platform', enum: ['platform', null] },
    status: {
      type: String,
      enum: Object.values(PlatformReleaseStatus),
      default: PlatformReleaseStatus.REQUESTED,
      required: true,
    },
    workflowRunId: { type: Number, default: null, min: 1 },
    workflowRunUrl: { type: String, default: null, maxlength: 500 },
    failureCode: { type: String, default: null, maxlength: 80 },
    callbackSequence: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'platform_release_requests' },
);

platformReleaseRequestSchema.index({ createdAt: -1 });
platformReleaseRequestSchema.index(
  { activeLock: 1 },
  {
    unique: true,
    partialFilterExpression: { activeLock: 'platform' },
    name: 'one_active_platform_release',
  },
);

export const PlatformReleaseRequest =
  mongoose.models.PlatformReleaseRequest ??
  mongoose.model('PlatformReleaseRequest', platformReleaseRequestSchema);
