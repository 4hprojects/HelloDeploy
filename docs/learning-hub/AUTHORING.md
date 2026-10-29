# Writing and Revising Learning Hub Articles

Articles are Markdown files in `content/blog/articles/`, one file per article. They are
reviewed through pull requests like code and go live with the next deployment.

## Add an article

1. Copy an existing article file and give it a new file name.
2. Set a new, permanent `id`. Never change it later: views and comments are stored against it.
3. Write the front matter (fields below) and the body. Start body headings at `##`; the page
   template renders the title as the only `#` heading.
4. Run `npm run content:check`. It must report no errors.
5. Follow the editorial workflow in [09_EDITORIAL_STANDARDS.md](09_EDITORIAL_STANDARDS.md) and
   record verification evidence in [ARTICLE_VERIFICATION.md](ARTICLE_VERIFICATION.md).

## Front matter

| Field               | Required | Notes                                                                                                                  |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`                | yes      | Lowercase slug characters. Immutable.                                                                                  |
| `slug`              | yes      | URL segment under `/blog/`. Reserved words (`category`, `api`, `author`, `page`, `search`, `tag`, `feed`) are refused. |
| `title`             | yes      | 10–110 characters.                                                                                                     |
| `description`       | yes      | 50–170 characters; used as the deck and meta description.                                                              |
| `category`          | yes      | A slug from `CATEGORIES` in `apps/web/src/config/learning-hub.js`.                                                     |
| `tags`              | yes      | 1–8 lowercase slugs.                                                                                                   |
| `authorId`          | yes      | An id from `AUTHORS` in the same file.                                                                                 |
| `status`            | yes      | `draft` or `published`. Drafts are never served.                                                                       |
| `publishedAt`       | yes      | ISO date. A published article may not be dated in the future.                                                          |
| `updatedAt`         | no       | Only for a substantive revision.                                                                                       |
| `difficulty`        | yes      | `beginner`, `intermediate`, or `advanced`.                                                                             |
| `featured`          | no       | The newest featured article leads the index.                                                                           |
| `commentsEnabled`   | no       | Per-article comment switch; comments also need the global switches.                                                    |
| `adEligible`        | no       | Per-article ad eligibility; ads are off site-wide.                                                                     |
| `heroImage`         | no       | `{ src, alt, width, height }`, `src` under `/assets/blog/`.                                                            |
| `socialImage`       | no       | Path under `/assets/blog/`, ideally 1200×630.                                                                          |
| `testedEnvironment` | no       | `{ summary, verifiedAt }`. Only for steps actually run.                                                                |
| `references`        | no       | List of `{ title, url }` with `https` URLs.                                                                            |
| `seo`               | no       | `{ title, description }` overrides. Canonical overrides are refused.                                                   |

## Markdown rules

- Raw HTML is disabled and renders as text.
- Links may be `https`, `http`, `mailto`, or same-site paths. Links to `/blog/...` must point at a
  published article or a category with published articles.
- Every image needs alt text.

## Rename a slug

Change `slug`, then add `'old-slug': 'new-slug'` to `SLUG_REDIRECTS`. The old URL answers with a
301 and the article keeps its id, views, and comments.
