# Public Content Authoring

How to add or change a page on the public website: marketing pages, documentation, Learn
articles, and troubleshooting guides.

Updated: 2026-09-28

## The three surfaces

| Surface                              | Lives in                    | Registry                     | Format   |
| ------------------------------------ | --------------------------- | ---------------------------- | -------- |
| Marketing and legal                  | `apps/web/src/views/pages/` | `src/config/public-pages.js` | EJS      |
| Documentation (`/docs`)              | `apps/web/content/docs/`    | `src/config/docs-pages.js`   | Markdown |
| Learn and troubleshooting (`/learn`) | `apps/web/content/learn/`   | `src/config/learn-pages.js`  | Markdown |

Marketing pages are EJS because they are layout-heavy — cards, grids, feature tiles.
Documentation and Learn are Markdown because they are prose-heavy, and hand-escaping code
fences inside templates does not scale past a handful of pages.

## Adding a documentation page

1. Write `apps/web/content/docs/your-page.md`. Start at `##` — the template renders the `h1`
   from the registry title.
2. Add an entry to the right section in `src/config/docs-pages.js`:

```js
{
  slug: 'your-page',
  title: 'Your Page',
  description: 'One sentence, used as the meta description. Must be unique.',
  file: 'your-page.md',
}
```

Order within a section is the order of the sidebar, the breadcrumbs and the previous/next
links. Moving an entry moves all three.

Nothing else is needed. The route, sidebar, index listing and sitemap all derive from the
registry.

## Adding a Learn article

Same shape, in `src/config/learn-pages.js`, with editorial metadata:

```js
article({
  slug: 'what-is-something',
  title: 'What Is Something?',
  description: 'One unique sentence.',
  file: 'what-is-something.md',
  published: '2026-09-28',
});
```

`article()` fills in the author and defaults `updated` to `published`. Both dates must be
`YYYY-MM-DD`, because they become `Article` structured data. Set `updated` explicitly when
revising an article meaningfully.

A troubleshooting guide is a Learn article with an explicit path and a `ts-` file prefix:

```js
article({
  slug: 'the-symptom',
  path: '/learn/troubleshooting/the-symptom',
  title: 'The Symptom',
  description: 'One unique sentence.',
  file: 'ts-the-symptom.md',
  published: '2026-09-28',
});
```

## Adding a marketing page

1. Write the view in `apps/web/src/views/pages/`.
2. Register a route in `src/app.js`, passing `title`, `description` and
   `layout: PUBLIC_LAYOUT`.
3. Flip the page's `live` flag in `src/config/public-pages.js`.

The `live` flag exists so navigation never offers a link that 404s. Flip it **in the same
change** that adds the route — a test fails if a page is marked live without one.

## What the tests enforce

These are invariants, not style preferences. Each has failed on a real mistake at least once.

- Every page marked live has a registered route.
- Every registry entry points at a content file that exists, and every content file is
  referenced by a registry entry.
- Titles and descriptions are unique across the whole public surface.
- Content never links to a `/docs/` or `/learn/` page that does not exist.
- No page starts with an `h1` — the template renders it.
- No page largely restates another. Deliberate repetition is allowed; wholesale duplication
  is not.
- Every landing page feature icon comes from the shared icon partial.

Run them with `node --test tests/ui/*.test.js`.

## House rules for the content itself

- **Never claim behaviour without checking the code.** Most of the corrections in this
  content came from reading the implementation and finding the plan had guessed wrong. If you
  cannot verify it, do not publish it.
- **Do not link to a page that does not exist yet.** Explain the concept inline, or leave the
  link out until the page lands.
- **No placeholder text** and no invented statistics, testimonials, or uptime figures.
- **Never publish a real secret** — no deploy hook token, verification value, tunnel id,
  connection string or API key, even as an example. Use obvious placeholders.
- **Say when something is not user-fixable.** Several domain failures cannot be solved at the
  reader's DNS provider. Sending someone round a loop they cannot win is worse than telling
  them to ask.

## Rendering and caching

Markdown is rendered per request by `services/content.service.js`, cached **only** in
production. In development an edit shows on refresh.

Rendered HTML carries no inline styles or scripts, which is what keeps it inside the strict
Content Security Policy. If you add raw HTML to a Markdown file, check it does not introduce
either.

## Related

- [Documentation Index](README.md)
- The content specification lives in `docs/to work on/hellodeploy-content-spec/`, including
  the QA checklists and their recorded results.
