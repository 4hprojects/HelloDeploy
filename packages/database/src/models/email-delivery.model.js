import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Outcome of one attempted send. */
export const EmailDeliveryOutcome = Object.freeze({
  SENT: 'SENT',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
});

const emailDeliverySchema = new Schema(
  {
    // Recipient is stored so an operator can tell whether a specific signup
    // was delivered. It is no broader an exposure than the users collection,
    // which already holds the same address.
    recipient: { type: String, required: true, maxlength: 320 },
    template: { type: String, required: true, maxlength: 64 },
    outcome: {
      type: String,
      enum: Object.values(EmailDeliveryOutcome),
      required: true,
    },
    // Provider error text is third-party output, so it is bounded.
    error: { type: String, default: null, maxlength: 500 },
  },
  {
    timestamps: true,
    collection: 'email_deliveries',
  },
);

// Operator queries are "what failed recently".
emailDeliverySchema.index({ outcome: 1, createdAt: -1 });
// TTL: a delivery log is a diagnostic aid, not a permanent record.
emailDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const EmailDelivery =
  mongoose.models.EmailDelivery ?? mongoose.model('EmailDelivery', emailDeliverySchema);
