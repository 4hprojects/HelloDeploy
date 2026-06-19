import mongoose from 'mongoose';

const { Schema } = mongoose;

const deploymentEventSchema = new Schema(
  {
    deploymentId: { type: Schema.Types.ObjectId, ref: 'Deployment', required: true },
    stage: { type: String, required: true }, // VALIDATE, BUILD, DEPLOY, etc.
    level: { type: String, enum: ['INFO', 'WARN', 'ERROR'], default: 'INFO' },
    // Message has already been redacted before storage — no secrets ever stored here.
    messageRedacted: { type: String, required: true, maxlength: 2000 },
    correlationId: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: 'deployment_events',
  },
);

// Ordered retrieval and retention queries
deploymentEventSchema.index({ deploymentId: 1, createdAt: 1 });
// TTL: events older than 30 days are automatically removed
deploymentEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const DeploymentEvent =
  mongoose.models.DeploymentEvent ?? mongoose.model('DeploymentEvent', deploymentEventSchema);
