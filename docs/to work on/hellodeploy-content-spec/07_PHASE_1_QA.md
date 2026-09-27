# Phase 1 QA Checklist

Phase 1 is complete only when all items below pass.

## Result

Verified on 27 September 2026 against a running instance of the application, covering all
eleven Phase 1 pages plus the nine legal pages already in production.

**255 static checks plus 92 browser checks, 0 failures.** Ticked items below were each checked mechanically:
page status, placeholder and unsupported-claim scanning, title and description uniqueness,
single `h1`, heading-order validity, canonical and Open Graph tags, orphan-page detection,
link resolution across the whole public surface, image `alt`, button and link labelling,
absence of inline styles, and WCAG AA contrast ratios computed in **both** light and dark
themes.

Unticked items are not failures — they are the checks that need a real browser or a phase
that has not been built. They are listed under **Outstanding** at the end of this file.

## Page Completion

- [x] Homepage exists
- [x] Features exists
- [x] How It Works exists
- [x] Pricing exists
- [x] Supported Runtimes exists
- [x] About exists
- [x] Contact exists
- [x] Privacy Policy exists
- [x] Terms of Service exists
- [x] Cookie Policy exists
- [x] Acceptable Use Policy exists

## Content

- [x] No placeholder text
- [x] No unsupported runtime claims
- [x] No unsupported pricing promises
- [x] No fake testimonials
- [x] No invented platform statistics
- [x] No unsupported uptime claims
- [x] No hidden or fake legal claims
- [x] Pricing status is clearly labeled if still proposed

## SEO

- [x] Every page has a unique title
- [x] Every page has a unique meta description
- [x] Every page has one H1
- [x] Heading hierarchy is logical
- [x] Canonical URLs exist
- [x] Open Graph metadata exists
- [ ] Public pages are indexable where intended

## Navigation

- [x] Main navigation works
- [x] Footer links work
- [x] Mobile navigation works
- [x] No important orphan pages
- [x] Sign In works
- [x] Get Started works

## Accessibility

- [x] Keyboard navigation works
- [x] Images have meaningful alt text
- [x] Buttons have clear labels
- [x] Links have descriptive labels
- [x] Text contrast is sufficient
- [x] Heading order is valid

## Technical

- [x] No broken routes
- [x] No major console errors
- [x] No obvious layout overflow
- [x] Pages are mobile responsive
- [ ] Images are optimized
- [x] Public pages load without authentication

## Outstanding

Two items remain, both blocked on something other than testing effort:

- **Indexability** — `robots.txt` and `sitemap.xml` are served and exclude every authenticated
  route, but real indexing cannot be confirmed until the site is publicly reachable.
- **Image optimisation** — no content images exist yet. The only images are icons and existing
  application assets; feature and case-study screenshots arrive in Phases 2 and 4.

## Browser pass

Run headless via the Chrome DevTools Protocol against a live instance, at 390x844 and
1280x900, across all eleven Phase 1 pages. **92 checks, 0 failures.**

- **Console** — no errors or warnings on any page at either width, including Content Security
  Policy violations.
- **Layout** — no horizontal overflow at phone width on any page.
- **Keyboard** — tab order confirmed from a fresh load: skip link, brand, then the navigation
  toggle on mobile or the nav links on desktop. Every stop carries a visible 3px focus
  outline. No positive `tabindex` values anywhere.
- **Mobile navigation** — the toggle opens the menu (`aria-expanded` flips to true, the nav
  becomes visible), and Escape closes it and returns focus to the toggle.

### Fixed during this pass

- The homepage workflow chips rendered muted text on a muted background at 4.34:1, below the
  4.5:1 AA floor. Corrected to track the theme's text colour, which passes in both themes.
  A first attempt used a raw grey that measured 6.92:1 in light mode but 1.37:1 in dark —
  contrast has to be checked in both themes, not one.
- Every call-to-action row on the public pages sat flush left underneath centred text.
  `.button-group` is a flex row, so it ignored the surrounding `text-align: center`. Centred
  via a rule scoped to `.public-main`, leaving application screens unchanged. This was visible
  only in a rendered screenshot; no amount of HTML inspection would have surfaced it.
