import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, maxlength: 255 },
    eventType: { type: String, required: true, maxlength: 80 },
    providerMessageId: { type: String, default: null, maxlength: 255 },
    occurredAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'notification_webhook_events' },
);
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const NotificationWebhookEvent =
  mongoose.models.NotificationWebhookEvent ?? mongoose.model('NotificationWebhookEvent', schema);
