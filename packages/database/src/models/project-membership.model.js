import mongoose from 'mongoose';
import { ProjectRole } from '@hellodeploy/contracts';

const { Schema } = mongoose;

const projectMembershipSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: Object.values(ProjectRole),
      required: true,
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'project_memberships',
  },
);

projectMembershipSchema.index({ projectId: 1, userId: 1 }, { unique: true });
projectMembershipSchema.index({ userId: 1 });
projectMembershipSchema.index({ projectId: 1, role: 1 });

export const ProjectMembership =
  mongoose.models.ProjectMembership ?? mongoose.model('ProjectMembership', projectMembershipSchema);
