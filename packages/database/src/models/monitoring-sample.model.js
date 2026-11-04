import mongoose from 'mongoose';

const { Schema } = mongoose;

const statSchema = new Schema({ avg: Number, max: Number }, { _id: false });

/**
 * One aggregated bucket of host and platform resource history. The worker
 * writes one 1-minute bucket per minute and rolls those up into 5-minute,
 * hourly and daily buckets; each bucket expires on its own `expiresAt`, set
 * from the monitoring policy's retention when it is written.
 */
const monitoringSampleSchema = new Schema(
  {
    resolution: { type: String, enum: ['1m', '5m', '1h', '1d'], required: true },
    bucketStart: { type: Date, required: true },
    // Raw samples the bucket summarizes; a short count shows a gap.
    count: { type: Number, required: true, min: 0 },
    cpu: statSchema,
    mem: statSchema,
    swap: statSchema,
    disk: statSchema,
    rx: statSchema,
    tx: statSchema,
    ccpu: statSchema,
    cmem: statSchema,
    expiresAt: { type: Date, required: true },
  },
  { collection: 'monitoring_samples', versionKey: false },
);

monitoringSampleSchema.index({ resolution: 1, bucketStart: 1 }, { unique: true });
monitoringSampleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MonitoringSample =
  mongoose.models.MonitoringSample ?? mongoose.model('MonitoringSample', monitoringSampleSchema);
