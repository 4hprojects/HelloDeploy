import mongoose from 'mongoose';
import {
  ProjectStatus,
  DeploymentMode,
  RuntimeType,
  DetectionStatus,
} from '@hellodeploy/contracts';

const { Schema } = mongoose;

const buildConfigurationSchema = new Schema(
  {
    buildCommand: { type: String, default: null },
    startCommand: { type: String, default: null },
    outputDirectory: { type: String, default: null },
    applicationPort: { type: Number, default: null, min: 1, max: 65535 },
    healthCheckPath: { type: String, default: '/' },
  },
  { _id: false },
);

const buildFiltersSchema = new Schema(
  {
    includedPaths: { type: [String], default: [] },
    ignoredPaths: { type: [String], default: [] },
  },
  { _id: false },
);

const maintenanceModeSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    message: { type: String, default: null },
    enabledAt: { type: Date, default: null },
  },
  { _id: false },
);

const reviewFlagSchema = new Schema(
  {
    active: { type: Boolean, default: false },
    reason: { type: String, default: null, maxlength: 200 },
    flaggedAt: { type: Date, default: null },
  },
  { _id: false },
);

const detectionIssueSchema = new Schema(
  {
    level: { type: String, enum: ['ERROR', 'WARNING'], required: true },
    message: { type: String, required: true, maxlength: 500 },
  },
  { _id: false },
);

const detectionSchema = new Schema(
  {
    status: {
      type: String,
      enum: Object.values(DetectionStatus),
      default: DetectionStatus.NOT_RUN,
    },
    issues: { type: [detectionIssueSchema], default: [] },
    checkedCommitSha: { type: String, default: null, maxlength: 40 },
    checkedAt: { type: Date, default: null },
  },
  { _id: false },
);

const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 63,
    },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: Object.values(ProjectStatus),
      default: ProjectStatus.DRAFT,
    },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', default: null },
    runtimeType: {
      type: String,
      enum: Object.values(RuntimeType),
      default: null,
    },
    productionBranch: { type: String, default: null, trim: true, maxlength: 255 },
    deploymentMode: {
      type: String,
      enum: Object.values(DeploymentMode),
      default: DeploymentMode.MANUAL,
    },
    buildConfiguration: { type: buildConfigurationSchema, default: () => ({}) },
    buildFilters: { type: buildFiltersSchema, default: () => ({}) },
    platformSubdomain: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 63,
    },
    activeDeploymentId: { type: Schema.Types.ObjectId, ref: 'Deployment', default: null },
    deployHookTokenHash: { type: String, default: null },
    quotaOverrideId: { type: Schema.Types.ObjectId, ref: 'Quota', default: null },
    configurationVersion: { type: Number, default: 1 },
    detection: { type: detectionSchema, default: () => ({}) },
    notificationPreference: {
      type: String,
      enum: ['ALL', 'FAILURE_ONLY', 'NONE'],
      default: 'ALL',
    },
    maintenanceMode: { type: maintenanceModeSchema, default: () => ({}) },
    reviewFlag: { type: reviewFlagSchema, default: () => ({}) },
    archivedAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, default: null, maxlength: 500 },
  },
  {
    timestamps: true,
    collection: 'projects',
  },
);

projectSchema.index({ ownerId: 1 });
projectSchema.index({ status: 1 });
projectSchema.index(
  { platformSubdomain: 1 },
  {
    unique: true,
    partialFilterExpression: { platformSubdomain: { $type: 'string' } },
  },
);
projectSchema.index({ activeDeploymentId: 1 }, { sparse: true });

export const Project = mongoose.models.Project ?? mongoose.model('Project', projectSchema);
