import { ArticleComment } from '@hellodeploy/database';

export const THREADS_PER_PAGE = 10;
export const VISIBLE_REPLIES = 20;

export class CommentThreadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CommentThreadError';
    this.code = code;
  }
}

/**
 * Published threads for one article, oldest first. A thread whose root is not
 * published is not shown at all, so its replies never appear out of context.
 * `expandThreadId` lifts the reply cap for one thread.
 */
export async function listCommentThreads(
  { articleId, page = 1, expandThreadId = null },
  { Comment = ArticleComment } = {},
) {
  const rootFilter = { articleId, parentId: null, status: 'published' };
  const rootIds = await Comment.find(rootFilter, { _id: 1 }).sort({ createdAt: 1, _id: 1 }).lean();
  const totalThreads = rootIds.length;
  const totalPages = Math.max(1, Math.ceil(totalThreads / THREADS_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageRootIds = rootIds
    .slice((currentPage - 1) * THREADS_PER_PAGE, currentPage * THREADS_PER_PAGE)
    .map((root) => root._id);

  const [roots, replies, visibleReplyCount] = await Promise.all([
    Comment.find({ _id: { $in: pageRootIds } })
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
    Comment.find({ articleId, parentId: { $in: pageRootIds }, status: 'published' })
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
    Comment.countDocuments({
      articleId,
      parentId: { $in: rootIds.map((root) => root._id) },
      status: 'published',
    }),
  ]);

  const threads = roots.map((root) => {
    const threadReplies = replies.filter((reply) => reply.parentId.equals(root._id));
    const isExpanded = expandThreadId !== null && root._id.equals(expandThreadId);
    const shown = isExpanded ? threadReplies : threadReplies.slice(0, VISIBLE_REPLIES);
    return {
      comment: present(root),
      replies: shown.map(present),
      hiddenReplyCount: threadReplies.length - shown.length,
    };
  });

  return {
    threads,
    totalComments: totalThreads + visibleReplyCount,
    page: currentPage,
    totalPages,
  };
}

/** The discussion page that holds a thread, so a new comment can be shown in place. */
export async function commentPageForThread(
  { articleId, rootId },
  { Comment = ArticleComment } = {},
) {
  const root = await Comment.findById(rootId, { createdAt: 1 }).lean();
  if (!root) {
    return 1;
  }
  const earlier = await Comment.countDocuments({
    articleId,
    parentId: null,
    status: 'published',
    $or: [
      { createdAt: { $lt: root.createdAt } },
      { createdAt: root.createdAt, _id: { $lt: root._id } },
    ],
  });
  return Math.floor(earlier / THREADS_PER_PAGE) + 1;
}

/**
 * Resolve where a reply belongs. A reply to a reply is stored under the same
 * root (one visual level) but keeps the id and name of the comment it answers.
 */
export async function resolveReplyTarget(
  { articleId, replyToCommentId },
  { Comment = ArticleComment } = {},
) {
  if (!replyToCommentId) {
    return { parentId: null, replyToCommentId: null, replyToDisplayName: null };
  }
  const target = await Comment.findById(replyToCommentId).lean();
  if (!target || target.articleId !== articleId || target.status !== 'published') {
    throw new CommentThreadError(
      'REPLY_TARGET_UNAVAILABLE',
      'The comment you are replying to is no longer available.',
    );
  }
  const rootId = target.parentId ?? target._id;
  if (target.parentId) {
    const root = await Comment.findById(rootId, { status: 1, articleId: 1 }).lean();
    if (!root || root.articleId !== articleId || root.status !== 'published') {
      throw new CommentThreadError(
        'REPLY_TARGET_UNAVAILABLE',
        'The comment you are replying to is no longer available.',
      );
    }
  }
  return {
    parentId: rootId,
    replyToCommentId: target._id,
    replyToDisplayName: target.displayName,
  };
}

function present(comment) {
  return {
    id: String(comment._id),
    parentId: comment.parentId ? String(comment.parentId) : null,
    replyToCommentId: comment.replyToCommentId ? String(comment.replyToCommentId) : null,
    replyToDisplayName: comment.replyToDisplayName,
    displayName: comment.displayName,
    body: comment.body,
    isStaff: comment.authorType === 'staff',
    createdAt: comment.createdAt,
  };
}
