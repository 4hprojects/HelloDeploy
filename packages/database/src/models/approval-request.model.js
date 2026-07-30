import mongoose from 'mongoose';
import { ApprovalStatus } from '@hellodeploy/contracts';

const { Schema } = mongoose;

const validationFindingSchema = new Schema(
  {
    code: { type: String, required: true, maxlength: 80 },
    label: { type: String, required: true, maxlength: 120 },
    status: {
      type: String,
      enum: ['PASS', 'WARNING', 'BLOCKING'],
      required: true,
    },
    message: { type: String, required: true, maxlength: 500 },
  },
  { _id: false },
);

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
    purpose: { type: String, default: null, trim: true, maxlength: 500 },
    snapshotConfigurationVersion: { type: Number, default: null, min: 1 },
    snapshotCommitSha: { type: String, default: null, maxlength: 40 },
    validationFindings: { type: [validationFindingSchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'approval_requests',
  },
);

approvalRequestSchema.index({ status: 1, createdAt: -1 });
approvalRequestSchema.index({ projectId: 1 });
approvalRequestSchema.index({ requestedBy: 1 });
approvalRequestSchema.index(
  { projectId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: ApprovalStatus.PENDING },
    name: 'one_pending_approval_per_project',
  },
);

export const ApprovalRequest =
  mongoose.models.ApprovalRequest ?? mongoose.model('ApprovalRequest', approvalRequestSchema);
