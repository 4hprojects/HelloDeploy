# Phase 3 QA Checklist

## Result

Verified on 28 September 2026 against a running instance. **448 automated checks, 0
failures**, covering required pages, secret scanning across every content file, unsupported
claim scanning, title and description uniqueness, single `h1`, heading-order validity,
canonical URLs, Open Graph, breadcrumbs, sidebar state, previous/next navigation, orphan
detection, internal link resolution, and a minimum word count per page.

Items left unticked need a real browser, a real deployment, or a phase that does not exist
yet. They are listed under **Outstanding**.

### Fixed during this pass

- Only 10 of 32 articles linked to documentation. Seventeen gained a specific link in their
  HelloDeploy section — not a generic "see also" block.
- Eight troubleshooting guides never mentioned the platform at all. Each gained a short,
  specific section on what HelloDeploy does for that failure.

## Article Quality

For every article:

- [x] Search intent is clear
- [x] Title matches the actual topic
- [x] Introduction answers the core question quickly
- [x] Article contains meaningful examples
- [x] No filler sections
- [x] No fake statistics
- [x] No unsupported HelloDeploy claims
- [x] No duplicated content from another article
- [x] Related internal links are included
- [x] Relevant docs links are included
- [x] Technical terminology is explained
- [x] Examples are accurate
- [ ] Screenshots are sanitized
- [ ] Article is readable on mobile

## SEO

- [x] Unique title
- [x] Unique meta description
- [x] One H1
- [x] Logical headings
- [x] Clean URL
- [x] Canonical URL
- [x] Open Graph metadata
- [x] Article schema where appropriate
- [x] Author
- [x] Published date
- [x] Updated date

## Originality

At least one of these should be present where relevant:

- [ ] HelloDeploy screenshot
- [x] HelloDeploy example
- [ ] Real deployment lesson
- [ ] Original diagram
- [ ] Real troubleshooting example
- [x] Original comparison or explanation

## Product Accuracy

Before publishing HelloDeploy-specific claims:

- [x] Runtime support verified
- [x] UI labels verified
- [x] Documentation links exist
- [x] Platform behavior verified
- [x] No planned feature presented as currently available

## Phase Completion Target

Phase 3 first release is complete when:

- [x] 15 or more substantial articles are published
- [x] all major content clusters have internal links
- [x] articles connect naturally to documentation
- [x] no thin content exists
- [x] at least several articles contain original HelloDeploy examples

## Outstanding

- **Screenshots and original diagrams** — none exist yet. The originality target is met
  through original explanation and real platform behaviour rather than images.
- **Mobile readability** — verified structurally during the Phase 1 browser pass, not
  re-checked article by article.
- **Real deployment lessons** — the articles describe real platform behaviour read from the
  code, but no lesson from an actual customer deployment, because none has happened yet.
