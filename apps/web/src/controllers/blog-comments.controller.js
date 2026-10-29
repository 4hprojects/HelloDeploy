import { PlatformRole } from '@hellodeploy/contracts';

import { commentPageForThread } from '../services/learning-hub/comment.service.js';

const STAFF_ROLES = [PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN];

const CLOSED_MESSAGE =
  'New comments are closed on this article right now. Published comments remain visible.';

/**
 * Guest comment and report endpoints. `requireOpen` runs before any rate
 * limiter or protection, so a closed discussion rejects every submission
 * outright, including ones crafted without the page.
 */
export function createBlogCommentsController({
  getRepository,
  discussion,
  pipeline,
  reportComment,
  renderArticle,
}) {
  async function requireOpen(req, res, next) {
    const article = getRepository().findPublishedBySlug(req.params.slug);
    if (!article) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown article.' } });
    }
    const availability = await discussion.getAvailability(article);
    if (!availability.accepting) {
      if (req.accepts(['html', 'json']) === 'json') {
        return res
          .status(503)
          .json({ error: { code: 'COMMENTS_CLOSED', message: CLOSED_MESSAGE } });
      }
      return renderArticle(req, res, article, {
        status: 503,
        form: formState(req.body, { form: CLOSED_MESSAGE }),
      });
    }
    req.article = article;
    next();
  }

  async function postComment(req, res) {
    const article = req.article;
    const result = await pipeline.submit({
      article,
      body: req.body,
      turnstileToken: req.body?.['cf-turnstile-response'],
      sourceIp: req.ip,
      staffUser: staffUser(req.session?.user),
    });

    if (result.outcome === 'published') {
      const comment = result.comment;
      const rootId = comment.parentId ?? comment._id;
      const page = await commentPageForThread({ articleId: article.id, rootId });
      req.flash?.('success', 'Your comment is published.');
      const query = page > 1 ? `?commentsPage=${page}` : '';
      return res.redirect(303, `/blog/${article.slug}${query}#comment-${comment._id}`);
    }
    return renderArticle(req, res, article, {
      status: result.status,
      form: formState(req.body, result.errors),
    });
  }

  // Reports stay open while new comments are paused: readers must always be
  // able to flag something already published.
  async function requireReportable(req, res, next) {
    const article = getRepository().findPublishedBySlug(req.params.slug);
    const availability = article ? await discussion.getAvailability(article) : null;
    if (!availability?.visible || !discussion.canAcceptReports) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown article.' } });
    }
    req.article = article;
    next();
  }

  async function postReport(req, res) {
    const article = req.article;
    const result = await reportComment({
      commentId: req.params.commentId,
      articleId: article.id,
      reason: req.body?.reason,
      sessionId: req.sessionID,
      turnstileToken: req.body?.['cf-turnstile-response'],
      sourceIp: req.ip,
    });
    const messages = {
      reported: 'Thank you. The comment was reported and checked again.',
      already_reported: 'You already reported this comment.',
      verification_failed: 'Complete the verification check and report again.',
      unavailable: 'Reports cannot be checked right now. Please try again later.',
      invalid: 'Choose a reason for the report.',
      not_found: 'That comment is no longer available.',
    };
    req.flash?.(result.status < 400 ? 'success' : 'error', messages[result.outcome]);
    res.redirect(303, `/blog/${article.slug}#comments`);
  }

  return { requireOpen, requireReportable, postComment, postReport };
}

function staffUser(user) {
  if (!user || !STAFF_ROLES.includes(user.platformRole)) {
    return null;
  }
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return { id: user.id, name: name || 'HelloDeploy team' };
}

// Echo back what the reader typed so a refused submission loses nothing.
function formState(body, errors) {
  const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
  return {
    displayName: text(body?.displayName, 60),
    body: text(body?.body, 2000),
    replyTo: text(body?.replyTo, 24),
    errors: errors ?? {},
  };
}
