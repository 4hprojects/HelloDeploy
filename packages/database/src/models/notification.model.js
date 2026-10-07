import mongoose from 'mongoose';
import { NotificationChannel, NotificationStatus } from '@hellodeploy/contracts';

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    channel: {
      type: String,
      enum: Object.values(NotificationChannel),
      default: NotificationChannel.EMAIL,
    },
    kind: { type: String, required: true, maxlength: 80 },
    status: {
      type: String,
      enum: Object.values(NotificationStatus),
      default: NotificationStatus.DRAFT,
      index: true,
    },
    correlationId: { type: String, required: true, maxlength: 128 },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    deploymentId: { type: Schema.Types.ObjectId, ref: 'Deployment', default: null },
    ciphertext: { type: String, required: true, select: false },
    iv: { type: String, required: true, select: false },
    authTag: { type: String, required: true, select: false },
    encryptionVersion: { type: Number, required: true },
    aadBound: { type: Boolean, default: true },
    providerMessageId: { type: String, default: null, maxlength: 255 },
    attemptCount: { type: Number, default: 0, min: 0 },
    lastErrorType: { type: String, default: null, maxlength: 80 },
    nextAttemptAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    delayedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    bouncedAt: { type: Date, default: null },
    suppressedAt: { type: Date, default: null },
  },
  // The legacy source database contains an unrelated application's
  // `notifications` collection. Keep email delivery records isolated.
  { timestamps: true, collection: 'email_notifications' },
);

notificationSchema.index({ status: 1, nextAttemptAt: 1 });
notificationSchema.index(
  { providerMessageId: 1 },
  { unique: true, partialFilterExpression: { providerMessageId: { $type: 'string' } } },
);

export const Notification =
  mongoose.models.Notification ?? mongoose.model('Notification', notificationSchema);
