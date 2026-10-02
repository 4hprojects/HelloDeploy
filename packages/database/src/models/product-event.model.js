import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PRODUCT_EVENT_NAMES = Object.freeze([
  'signup_started',
  'signup_completed',
  'verification_completed',
  'project_created',
  'github_connected',
  'repository_selected',
  'detection_completed',
  'readiness_blocked',
  'approval_submitted',
  'first_deploy_started',
  'first_deploy_failed',
  'first_deploy_succeeded',
  'web_vital',
]);

const productEventSchema = new Schema(
  {
    name: { type: String, enum: PRODUCT_EVENT_NAMES, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    properties: {
      type: Schema.Types.Mixed,
      default: null,
      validate: {
        validator(value) {
          return value === null || value === undefined || JSON.stringify(value).length <= 1_000;
        },
        message: 'product event properties must not exceed 1,000 serialized characters.',
      },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'product_events' },
);

productEventSchema.index({ name: 1, createdAt: -1 });
productEventSchema.index({ userId: 1, createdAt: -1 });
productEventSchema.index({ projectId: 1, createdAt: -1 });
productEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const ProductEvent =
  mongoose.models.ProductEvent ?? mongoose.model('ProductEvent', productEventSchema);
