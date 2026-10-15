import mongoose from 'mongoose';
import { ProjectRole } from '@hellodeploy/contracts';

const { Schema } = mongoose;

// Pending invites for emails with no account yet. They are claimed into a
// ProjectMembership once someone verifies that address.
const projectInvitationSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    role: {
      type: String,
      enum: Object.values(ProjectRole),
      required: true,
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // NOTE: expiry is enforced in queries, not a TTL index, so expired rows
    // are replaced in place instead of vanishing mid-request.
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: 'project_invitations',
  },
);

projectInvitationSchema.index({ projectId: 1, email: 1 }, { unique: true });
projectInvitationSchema.index({ email: 1 });

export const ProjectInvitation =
  mongoose.models.ProjectInvitation ?? mongoose.model('ProjectInvitation', projectInvitationSchema);
