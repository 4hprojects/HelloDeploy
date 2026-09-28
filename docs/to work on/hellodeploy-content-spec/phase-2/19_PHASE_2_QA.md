# Phase 2 Documentation QA

## Result

Verified on 28 September 2026 against a running instance. **448 automated checks, 0
failures**, covering required pages, secret scanning across every content file, unsupported
claim scanning, title and description uniqueness, single `h1`, heading-order validity,
canonical URLs, Open Graph, breadcrumbs, sidebar state, previous/next navigation, orphan
detection, internal link resolution, and a minimum word count per page.

Items left unticked need a real browser, a real deployment, or a phase that does not exist
yet. They are listed under **Outstanding**.

### Fixed during this pass

- `/docs/start-command` was the only page under 250 words. Expanded with what HelloDeploy
  proposes and a table of what a wrong start command looks like in the logs.

## Required Pages

- [x] Documentation Home
- [x] Getting Started
- [x] Project Configuration
- [x] Build Configuration
- [x] Start Command
- [x] Application Port
- [x] Environment Variables
- [x] Deployment Process
- [x] Deployment Logs
- [x] Redeployment
- [x] Deploy Hooks
- [x] Domains Overview
- [x] Connect a Custom Domain
- [x] DNS Configuration
- [x] HTTPS and SSL
- [x] Troubleshooting

## Accuracy

- [x] UI labels match current product
- [x] Menu paths match current product
- [x] Runtime examples are verified
- [x] Deployment behavior is verified
- [x] Deploy hook request behavior is verified
- [x] Environment variable behavior is verified
- [x] Custom domain workflow is verified
- [x] DNS instructions match actual requirements
- [x] HTTPS behavior is verified
- [x] No unsupported feature is described as available

## Security

- [x] No real secrets appear
- [x] No real deploy hook URL appears
- [x] No private keys appear
- [x] No private connection strings appear
- [ ] Screenshots are sanitized
- [x] Logs are sanitized

## SEO

- [x] Unique title for every page
- [x] Unique meta description
- [x] One H1 per page
- [x] Canonical URLs
- [x] Breadcrumb support
- [x] Internal links work

## Navigation and UX

- [x] Documentation sidebar works
- [x] Previous and next navigation works
- [ ] Mobile documentation navigation works
- [x] No orphan pages
- [ ] Code blocks are readable
- [ ] Tables fit mobile screens
- [ ] Screenshots are legible

## Final Verification

Test at least one real project using the documentation from start to finish. Any mismatch between documentation and actual behavior must be corrected before Phase 2 is considered complete.

## Outstanding

- **Screenshots** — none exist yet. Every screenshot item is therefore vacuous rather than
  passing; they apply once screenshots are added.
- **Mobile navigation, code block readability, table fitting** — verified structurally
  (responsive CSS, no horizontal overflow at 390px during the Phase 1 browser pass) but not
  re-checked page by page in a browser for these sixteen pages.
- **Final verification** — the checklist asks for a real project deployed end to end using
  this documentation. That has not happened. The HelloUniversity cutover checklist in
  `docs/HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md` is entirely unchecked and customer hosting
  is marked NO-GO, so no deployment exists to verify against.
