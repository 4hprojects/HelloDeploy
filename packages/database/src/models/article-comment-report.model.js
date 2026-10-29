import mongoose from 'mongoose';

const { Schema } = mongoose;

export const COMMENT_REPORT_REASONS = Object.freeze([
  'spam',
  'harassment',
  'hate',
  'threats',
  'personal_data',
  'other',
]);

// Reports expire with the investigation window; the comment keeps its count.
const REPORT_RETENTION_SECONDS = 90 * 24 * 60 * 60;

const articleCommentReportSchema = new Schema(
  {
    commentId: { type: Schema.Types.ObjectId, ref: 'ArticleComment', required: true },
    articleId: { type: String, required: true, maxlength: 64 },
    // HMAC of the reporter's session, so one reader counts once per comment.
    reporterHash: { type: String, required: true, maxlength: 64 },
    reason: { type: String, enum: COMMENT_REPORT_REASONS, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'article_comment_reports',
  },
);

articleCommentReportSchema.index({ commentId: 1, reporterHash: 1 }, { unique: true });
articleCommentReportSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: REPORT_RETENTION_SECONDS },
);

export const ArticleCommentReport =
  mongoose.models.ArticleCommentReport ??
  mongoose.model('ArticleCommentReport', articleCommentReportSchema);
