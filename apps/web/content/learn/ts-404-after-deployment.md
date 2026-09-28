## Quick answer

The site is being served — a 404 proves something answered — but the path you asked for was
not found. For a static site this is usually the output directory or a missing index file.
For a single-page application it is usually that the server does not know to serve
`index.html` for every route.

## Symptoms

- The home page loads and other pages 404.
- Every page 404s, including the home page.
- Pages work until you refresh, then 404.
- A deep link shared with someone else 404s.

## The distinction that matters

**A 404 from your application** means your code ran and decided that route does not exist.

**A 404 from the server** means nothing matched at all — a missing file, or a wrong output
directory.

Which one you have narrows the cause considerably. An application 404 usually looks like your
site; a server 404 usually looks plain.

## Common causes

- **Wrong output directory.** The build wrote to `dist` and the platform is serving `build`,
  or the reverse.
- **No `index.html`** at the root of what is served.
- **A single-page application without a fallback.** Routing happens in the browser, so the
  server has no file at `/about` and returns 404 — which is why it works until you refresh.
- **A path that does not exist in production**, because the file was never committed.
- **Case sensitivity.** `/About` and `/about` are different on the server.

## How to check

1. Does the home page load? If yes, the site is being served and this is a routing question.
2. Does the 404 look like your site or like a plain server page?
3. Check the build output directory against what your build actually produces.
4. For a single-page application: does the page work on navigation and fail on refresh? That
   is the fallback.
5. Check the exact capitalisation of the path.

## How to fix

**Wrong output directory.** Set it to match what your build produces — `build` for Create
React App, `dist` for Vite and Vue CLI.

**Missing index.** Make sure the build produces one at the root of the output.

**Single-page application.** The server needs to serve `index.html` for unmatched routes so
the browser-side router can take over. Check your framework's guidance for production
deployment.

**Uncommitted file.** Commit it.

**Case.** Rename so the path matches exactly.

## Verify

Redeploy, then test a deep link directly rather than by clicking through the site. Typing the
URL is what exercises server-side routing.

## Related

- [Build Configuration](/docs/build-configuration)
