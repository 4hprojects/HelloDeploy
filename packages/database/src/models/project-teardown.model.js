import mongoose from 'mongoose';
import { ProjectTeardownStatus } from '@hellodeploy/contracts';

const { Schema } = mongoose;

// The project's own records are deleted as soon as its teardown is queued, so
// this is the only place left that knows which containers, images and routes
// still need removing after the worker gives up.
const projectTeardownSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, required: true },
    projectSlug: { type: String, required: true, maxlength: 100 },
    projectName: { type: String, default: null, maxlength: 200 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    remaining: {
      containerIds: { type: [String], default: [] },
      imageTags: { type: [String], default: [] },
      registryImageRefs: { type: [String], default: [] },
      subdomain: { type: String, default: null },
      customDomainHostnames: { type: [String], default: [] },
    },
    status: {
      type: String,
      enum: Object.values(ProjectTeardownStatus),
      default: ProjectTeardownStatus.PENDING,
    },
    failures: { type: [String], default: [] },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'project_teardowns',
  },
);

projectTeardownSchema.index({ status: 1, updatedAt: -1 });
projectTeardownSchema.index({ projectId: 1 });

export const ProjectTeardown =
  mongoose.models.ProjectTeardown ?? mongoose.model('ProjectTeardown', projectTeardownSchema);
