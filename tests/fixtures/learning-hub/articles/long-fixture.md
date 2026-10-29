---
id: fixture-long
slug: fixture-long-article
title: A fixture article with a deliberately long title that must wrap cleanly on narrow phones
description: Synthetic browser-test article with headings, code, a table, and long words for layout checks.
category: deployment-guides
tags: [fixture, layout]
authorId: henson-sagorsor
status: published
featured: true
publishedAt: '2026-10-20'
updatedAt: '2026-10-25'
difficulty: beginner
commentsEnabled: true
references:
  - title: Node.js documentation
    url: https://nodejs.org/docs/latest/api/
---

## First section

This fixture is synthetic and exists only for browser tests. A long unbroken word follows: supercalifragilisticexpialidocioussupercalifragilisticexpialidocious.

```sh
npm ci --omit=dev && NODE_ENV=production node server.js --a-very-long-flag-that-forces-horizontal-scrolling=true
```

## Second section

| Column one              | Column two                    | Column three | Column four            |
| ----------------------- | ----------------------------- | ------------ | ---------------------- |
| A long table cell value | Another long table cell value | More content | Even more content here |

### A subsection

> **Note:** a callout written as a blockquote.

## Third section

Read the [second fixture](/blog/fixture-short-article).
