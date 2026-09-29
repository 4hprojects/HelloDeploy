import mongoose from 'mongoose';

const { Schema } = mongoose;

// Env var names follow POSIX convention: uppercase letters, digits, underscore,
// must not start with a digit.
const NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

const environmentSecretSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      validate: {
        validator: (v) => NAME_PATTERN.test(v),
        message: 'Secret name must match [A-Z_][A-Z0-9_]*',
      },
    },
    // AES-256-GCM encrypted payload (all fields base64-encoded)
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    encryptionVersion: { type: Number, required: true, default: 1 },
    // Whether the ciphertext is bound to this record's projectId+name via GCM
    // additional authenticated data. False on records written before binding
    // existed, which must keep decrypting without it. Separate from
    // encryptionVersion, which says only which master key was used.
    aadBound: { type: Boolean, required: true, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'environment_secrets',
  },
);

environmentSecretSchema.index({ projectId: 1, name: 1 }, { unique: true });

export const EnvironmentSecret =
  mongoose.models.EnvironmentSecret ?? mongoose.model('EnvironmentSecret', environmentSecretSchema);
