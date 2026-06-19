import mongoose from 'mongoose';
import { ProjectStatus, DeploymentMode, RuntimeType } from '@hellodeploy/contracts';

const { Schema } = mongoose;

const buildConfigurationSchema = new Schema(
  {
    buildCommand: { type: String, default: null },
    startCommand: { type: String, default: null },
    outputDirectory: { type: String, default: null },
    applicationPort: { type: Number, default: null, min: 1, max: 65535 },
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
    platformSubdomain: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 63,
    },
    activeDeploymentId: { type: Schema.Types.ObjectId, ref: 'Deployment', default: null },
    quotaOverrideId: { type: Schema.Types.ObjectId, ref: 'Quota', default: null },
    configurationVersion: { type: Number, default: 1 },
    archivedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'projects',
  },
);

projectSchema.index({ ownerId: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ platformSubdomain: 1 }, { unique: true, sparse: true });
projectSchema.index({ activeDeploymentId: 1 }, { sparse: true });

export const Project = mongoose.models.Project ?? mongoose.model('Project', projectSchema);
