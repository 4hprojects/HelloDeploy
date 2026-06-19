import mongoose from 'mongoose';

const { Schema } = mongoose;

const repositorySchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    installationId: { type: Number, required: true },
    githubRepoId: { type: Number, required: true },
    nodeId: { type: String, required: true },
    fullName: { type: String, required: true, trim: true }, // owner/repo
    name: { type: String, required: true, trim: true },
    ownerLogin: { type: String, required: true, trim: true },
    defaultBranch: { type: String, default: 'main', trim: true },
    visibility: { type: String, enum: ['public', 'private'], default: 'private' },
    lastCommitSha: { type: String, default: null },
    lastCommitMessage: { type: String, default: null, maxlength: 500 },
    lastCommitAt: { type: Date, default: null },
    accessStatus: {
      type: String,
      enum: ['ACTIVE', 'REVOKED', 'SUSPENDED'],
      default: 'ACTIVE',
    },
    connectedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'repositories',
  },
);

repositorySchema.index({ projectId: 1 });
repositorySchema.index({ installationId: 1, fullName: 1 });
repositorySchema.index({ githubRepoId: 1 });

export const Repository =
  mongoose.models.Repository ?? mongoose.model('Repository', repositorySchema);
