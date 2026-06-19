import mongoose from 'mongoose';
import { ApprovalStatus } from '@hellodeploy/contracts';

const { Schema } = mongoose;

const approvalRequestSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestType: {
      type: String,
      enum: ['INITIAL_DEPLOYMENT', 'CONFIG_CHANGE'],
      default: 'INITIAL_DEPLOYMENT',
    },
    status: {
      type: String,
      enum: Object.values(ApprovalStatus),
      default: ApprovalStatus.PENDING,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    adminNote: { type: String, default: null, maxlength: 1000 },
  },
  {
    timestamps: true,
    collection: 'approval_requests',
  },
);

approvalRequestSchema.index({ status: 1, createdAt: -1 });
approvalRequestSchema.index({ projectId: 1 });
approvalRequestSchema.index({ requestedBy: 1 });

export const ApprovalRequest =
  mongoose.models.ApprovalRequest ?? mongoose.model('ApprovalRequest', approvalRequestSchema);
