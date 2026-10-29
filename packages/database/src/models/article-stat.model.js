import mongoose from 'mongoose';

const { Schema } = mongoose;

export const SHARE_PLATFORMS = Object.freeze([
  'facebook',
  'linkedin',
  'x',
  'reddit',
  'email',
  'copy',
  'native',
]);

// Keyed by the article's immutable id from its front matter, never its slug,
// so a renamed article keeps its counts.
const articleStatSchema = new Schema(
  {
    articleId: { type: String, required: true, maxlength: 64 },
    views: { type: Number, default: 0, min: 0 },
    shareClicks: Object.fromEntries(
      SHARE_PLATFORMS.map((platform) => [platform, { type: Number, default: 0, min: 0 }]),
    ),
  },
  {
    timestamps: true,
    collection: 'article_stats',
  },
);

articleStatSchema.index({ articleId: 1 }, { unique: true });

export const ArticleStat =
  mongoose.models.ArticleStat ?? mongoose.model('ArticleStat', articleStatSchema);
