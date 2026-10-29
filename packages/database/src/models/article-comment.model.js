import mongoose from 'mongoose';

const { Schema } = mongoose;

export const COMMENT_STATUSES = Object.freeze(['published', 'rejected', 'hidden', 'removed']);
export const COMMENT_AUTHOR_TYPES = Object.freeze(['guest', 'staff']);

// Rejected submissions are kept only long enough to investigate abuse.
export const REJECTED_COMMENT_RETENTION_SECONDS = 7 * 24 * 60 * 60;

const articleCommentSchema = new Schema(
  {
    articleId: { type: String, required: true, maxlength: 64 },
    // The thread root: null for a top-level comment, the root's id for every reply.
    parentId: { type: Schema.Types.ObjectId, default: null },
    // The comment actually replied to, which may be another reply in the thread.
    replyToCommentId: { type: Schema.Types.ObjectId, default: null },
    replyToDisplayName: { type: String, default: null, maxlength: 60 },
    displayName: { type: String, required: true, minlength: 2, maxlength: 60 },
    body: { type: String, required: true, maxlength: 2000 },
    authorType: { type: String, enum: COMMENT_AUTHOR_TYPES, default: 'guest' },
    staffUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: COMMENT_STATUSES, required: true },
    moderation: {
      decision: { type: String, default: null, maxlength: 20 },
      reasons: { type: [String], default: [] },
      provider: { type: String, default: null, maxlength: 40 },
      policyVersion: { type: String, default: null, maxlength: 40 },
      checkedAt: { type: Date, default: null },
    },
    reports: {
      count: { type: Number, default: 0, min: 0 },
      lastReportedAt: { type: Date, default: null },
    },
    fingerprint: { type: String, default: null, maxlength: 64 },
    idempotencyKey: { type: String, default: null, maxlength: 64 },
    statusChangedAt: { type: Date, default: null },
    statusChangedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    purgeAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'article_comments',
  },
);

articleCommentSchema.index({ articleId: 1, parentId: 1, status: 1, createdAt: 1 });
articleCommentSchema.index({ status: 1, createdAt: -1 });
articleCommentSchema.index({ 'reports.count': -1, 'reports.lastReportedAt': -1 });
articleCommentSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
// Only rejected submissions get a purgeAt, so nothing else ever expires.
articleCommentSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const ArticleComment =
  mongoose.models.ArticleComment ?? mongoose.model('ArticleComment', articleCommentSchema);
