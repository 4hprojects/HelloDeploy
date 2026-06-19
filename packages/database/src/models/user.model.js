import mongoose from 'mongoose';
import { PlatformRole, UserStatus } from '@hellodeploy/contracts';

const { Schema } = mongoose;

// Email verification and password reset tokens are stored as SHA-256 hashes.
// The raw token is sent to the user; only the hash lives in the database.
const userSchema = new Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Never returned by default queries
    },
    platformRole: {
      type: String,
      enum: Object.values(PlatformRole),
      default: PlatformRole.USER,
    },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.PENDING_VERIFICATION,
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },

    // Email verification token (hashed)
    emailVerificationTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    emailVerificationExpiresAt: {
      type: Date,
      default: null,
    },

    // Password reset token (hashed)
    passwordResetTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
    },
    passwordResetAttempts: {
      type: Number,
      default: 0,
    },

    // Suspension
    suspendedAt: {
      type: Date,
      default: null,
    },
    suspensionReason: {
      type: String,
      default: null,
    },

    // Incremented whenever configuration changes require re-auth notice
    configVersion: {
      type: Number,
      default: 1,
    },

    // GitHub App installation — numeric installation ID, null until user connects GitHub
    githubInstallationId: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'users',
  },
);

// Additional indexes (email unique index is implicit from schema field definition)
userSchema.index({ status: 1, platformRole: 1 });
userSchema.index({ emailVerificationExpiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

/**
 * Safe representation for session storage and API responses.
 * Never includes passwordHash or token hashes.
 */
userSchema.methods.toSessionUser = function () {
  return {
    id: this._id.toString(),
    firstName: this.firstName,
    lastName: this.lastName,
    email: this.email,
    platformRole: this.platformRole,
    status: this.status,
    configVersion: this.configVersion,
  };
};

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
