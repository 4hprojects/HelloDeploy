import mongoose from 'mongoose';
import {
  DeploymentStatus,
  DeploymentTrigger,
  RuntimeType,
  BuildStrategy,
} from '@hellodeploy/contracts';

const { Schema } = mongoose;

const deploymentBuildConfigurationSchema = new Schema(
  {
    buildCommand: { type: String, default: null },
    startCommand: { type: String, default: null },
    outputDirectory: { type: String, default: null },
    applicationPort: { type: Number, default: null, min: 1, max: 65535 },
    healthCheckPath: { type: String, default: '/' },
    applicationRoot: { type: String, default: '.', maxlength: 255 },
    // WSGI/ASGI entry point (`module:attribute`) for Python strategies only.
    applicationModule: { type: String, default: null, maxlength: 200 },
  },
  { _id: false },
);

const configurationSnapshotSchema = new Schema(
  {
    schemaVersion: { type: Number, required: true, default: 1 },
    buildStrategy: {
      type: String,
      enum: Object.values(BuildStrategy),
      required: true,
    },
    runtimeType: { type: String, enum: Object.values(RuntimeType), required: true },
    buildConfiguration: { type: deploymentBuildConfigurationSchema, required: true },
    projectConfigurationVersion: { type: Number, required: true },
    environmentVersion: { type: Number, required: true },
    sourceCommit: { type: String, required: true, maxlength: 40 },
    // The repository the commit belongs to, fixed at enqueue like the commit.
    sourceRepositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', default: null },
  },
  { _id: false },
);

const deploymentSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    sequenceNumber: { type: Number, required: true, min: 1 },
    triggerType: {
      type: String,
      enum: Object.values(DeploymentTrigger),
      required: true,
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    commitSha: { type: String, required: true, maxlength: 40 },
    commitMessage: { type: String, default: null, maxlength: 500 },
    branch: { type: String, default: null, maxlength: 255 },
    configurationVersion: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(DeploymentStatus),
      default: DeploymentStatus.QUEUED,
    },
    currentStage: { type: String, default: null },
    imageTag: { type: String, default: null },
    imageRef: { type: String, default: null, maxlength: 1000 },
    imageDigest: {
      type: String,
      default: null,
      match: /^sha256:[a-f0-9]{64}$/,
    },
    configurationSnapshot: {
      type: configurationSnapshotSchema,
      default: null,
      immutable: true,
    },
    candidateContainerId: { type: String, default: null },
    activeContainerId: { type: String, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failureCode: { type: String, default: null },
    failureSummary: { type: String, default: null, maxlength: 1000 },
    // Host-side loopback port this container is published on (127.0.0.1:containerPort)
    containerPort: { type: Number, default: null },
    containerName: { type: String, default: null },
    containerNetworkName: { type: String, default: null },
    // For rollback deployments: which deployment this was rolled back from
    sourceDeploymentId: { type: Schema.Types.ObjectId, ref: 'Deployment', default: null },
    // For rollback deployments: which live deployment the rollback replaced.
    replacedDeploymentId: { type: Schema.Types.ObjectId, ref: 'Deployment', default: null },
    // Random key of this deployment's anonymized study copy; deleted with the deployment.
    studyId: { type: String, default: null },
    studyArchivedAt: { type: Date, default: null },
    // Last observed state of activeContainerId, written by the worker at go-live
    // and by its periodic uptime sweep; the web process has no Docker access.
    runtime: {
      containerStartedAt: { type: Date, default: null },
      isRunning: { type: Boolean, default: false },
      checkedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
    collection: 'deployments',
  },
);

// One deployment per project per sequence number
deploymentSchema.index({ projectId: 1, sequenceNumber: 1 }, { unique: true });
deploymentSchema.index({ projectId: 1, status: 1 });
deploymentSchema.index({ status: 1 });
deploymentSchema.index({ studyArchivedAt: 1, status: 1 });

export const Deployment =
  mongoose.models.Deployment ?? mongoose.model('Deployment', deploymentSchema);
