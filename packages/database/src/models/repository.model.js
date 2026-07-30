import mongoose from 'mongoose';
import {
  normalizePublicGithubRepositoryUrl,
  RepositoryProvider,
  RepositorySourceType,
} from '@hellodeploy/contracts';

const { Schema } = mongoose;

const repositorySchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    sourceType: {
      type: String,
      enum: Object.values(RepositorySourceType),
      default: RepositorySourceType.GITHUB_APP,
      required: true,
    },
    provider: {
      type: String,
      enum: Object.values(RepositoryProvider),
      default: RepositoryProvider.GITHUB,
      required: true,
    },
    canonicalCloneUrl: {
      type: String,
      default: null,
      required() {
        return this.sourceType === RepositorySourceType.PUBLIC_GIT;
      },
    },
    installationId: {
      type: Number,
      default: null,
      required() {
        return this.sourceType !== RepositorySourceType.PUBLIC_GIT;
      },
    },
    githubRepoId: {
      type: Number,
      default: null,
      required() {
        return this.sourceType !== RepositorySourceType.PUBLIC_GIT;
      },
    },
    nodeId: {
      type: String,
      default: null,
      required() {
        return this.sourceType !== RepositorySourceType.PUBLIC_GIT;
      },
    },
    fullName: { type: String, required: true, trim: true }, // owner/repo
    name: { type: String, required: true, trim: true },
    ownerLogin: { type: String, required: true, trim: true },
    defaultBranch: { type: String, default: 'main', trim: true },
    visibility: { type: String, enum: ['public', 'private'], default: 'private' },
    lastCommitSha: { type: String, default: null },
    lastCommitMessage: { type: String, default: null, maxlength: 500 },
    lastCommitAt: { type: Date, default: null },
    lastAccessCheckedAt: { type: Date, default: null },
    accessStatus: {
      type: String,
      enum: ['ACTIVE', 'REVOKED', 'SUSPENDED', 'INACCESSIBLE'],
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

repositorySchema.pre('validate', function validateSourceCombination() {
  if (this.sourceType === RepositorySourceType.PUBLIC_GIT) {
    if (this.visibility !== 'public') {
      this.invalidate('visibility', 'Public Git repositories must have public visibility.');
    }
    try {
      const normalized = normalizePublicGithubRepositoryUrl(this.canonicalCloneUrl);
      if (
        normalized.canonicalCloneUrl !== this.canonicalCloneUrl ||
        normalized.fullName !== this.fullName ||
        normalized.ownerLogin !== this.ownerLogin ||
        normalized.name !== this.name
      ) {
        this.invalidate('canonicalCloneUrl', 'Public Git clone URL must be canonical.');
      }
    } catch {
      this.invalidate('canonicalCloneUrl', 'Public Git clone URL must be canonical.');
    }
  }
});

export const Repository =
  mongoose.models.Repository ?? mongoose.model('Repository', repositorySchema);
