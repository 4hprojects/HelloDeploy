import mongoose from 'mongoose';
import { APPROVED_IMAGE_REGISTRIES } from '@hellodeploy/contracts';

const { Schema } = mongoose;

// A project's pull credential for one approved registry, used only to resolve
// and pull that project's prebuilt image. The token is never returned to a
// client and is bound to projectId+registry through GCM additional data.
const registryCredentialSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    registry: { type: String, enum: APPROVED_IMAGE_REGISTRIES, required: true },
    username: { type: String, required: true, trim: true, maxlength: 255 },
    // AES-256-GCM encrypted token (all fields base64-encoded)
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    encryptionVersion: { type: Number, required: true, default: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'registry_credentials',
  },
);

registryCredentialSchema.index({ projectId: 1, registry: 1 }, { unique: true });

/** The additional authenticated data name that binds a token to its registry. */
export function registryCredentialAadName(registry) {
  return `registry:${registry}`;
}

export const RegistryCredential =
  mongoose.models.RegistryCredential ??
  mongoose.model('RegistryCredential', registryCredentialSchema);
