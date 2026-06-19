import mongoose from 'mongoose';
import { DeploymentStatus, DeploymentTrigger } from '@hellodeploy/contracts';

const { Schema } = mongoose;

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
    configurationVersion: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(DeploymentStatus),
      default: DeploymentStatus.QUEUED,
    },
    currentStage: { type: String, default: null },
    imageTag: { type: String, default: null },
    imageDigest: { type: String, default: null },
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

export const Deployment =
  mongoose.models.Deployment ?? mongoose.model('Deployment', deploymentSchema);
