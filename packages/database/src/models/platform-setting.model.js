import mongoose from 'mongoose';

const { Schema } = mongoose;

const platformSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    value: { type: Schema.Types.Mixed, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    collection: 'platform_settings',
  },
);

export const PlatformSetting =
  mongoose.models.PlatformSetting ?? mongoose.model('PlatformSetting', platformSettingSchema);
