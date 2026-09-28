# Phase 5 QA Checklist

## Result

Verified on 28 September 2026 against a running instance, as part of a combined Phase 2, 3
and 5 pass: **448 automated checks, 0 failures** covering required guides, secret scanning,
unsupported claim scanning, SEO metadata, breadcrumbs, internal link resolution and minimum
length, plus targeted structural checks for this phase.

### Fixed during this pass

- **The triage hub linked to none of the fourteen guides.** `/docs/troubleshooting` routed
  readers to other documentation pages but never to the detailed guide for their symptom,
  which is the one thing a triage page exists to do. It now links to all fourteen.
- **Six guides had no verification step** — the domain, SSL and 502 ones, where confirming a
  fix genuinely matters because DNS caching makes "it works for me" unreliable. Each now says
  to check from a network that has not cached the old answer.
- **One guide had no related links.**

## Required Guides

- [x] Dependency Installation Failed
- [x] Build Command Failed
- [x] Application Starts but Website Does Not Load
- [x] Application Port Is Incorrect
- [x] Missing Environment Variable
- [x] Application Keeps Restarting
- [x] Custom Domain Is Not Resolving
- [x] SSL Certificate Is Not Working
- [x] 502 Bad Gateway
- [x] 404 After Deployment
- [x] Root Domain Works but WWW Does Not
- [x] WWW Works but Root Domain Does Not
- [x] DNS Record Points to Wrong Server
- [x] Application Works Locally but Fails on HelloDeploy

## Accuracy

For each guide:

- [x] Symptom is realistic
- [x] Causes are technically plausible
- [x] HelloDeploy-specific behavior is verified
- [x] UI labels are verified
- [x] No fake error messages
- [x] No fake timeout values
- [x] No unsupported health-check claims
- [x] No unsupported restart claims

## Troubleshooting Quality

- [x] Quick answer is clear
- [x] Diagnostic steps are ordered
- [x] Fixes map to causes
- [x] Verification step exists
- [x] Related docs are linked
- [x] Related Learn articles are linked

## Security

- [ ] No secrets in screenshots
- [x] No real deploy hooks
- [x] No private keys
- [x] Logs sanitized
- [x] No real user data

## SEO

- [x] Unique title
- [x] Unique meta description
- [x] One H1
- [x] Clean URL
- [x] Canonical URL
- [x] Breadcrumb
- [x] Internal links

## UX

- [x] Easy to scan
- [x] Short paragraphs
- [x] Numbered diagnostic steps
- [x] Clear expected result
- [ ] Mobile readable

## Phase Completion

Phase 5 is complete when:

- [x] all initial guides are published
- [x] troubleshooting hub links to them
- [x] docs link to relevant guides
- [x] support escalation path exists
- [ ] real platform issues have been incorporated where available

## Outstanding

- **Screenshots** — none exist yet, so the screenshot item is vacuous rather than passing.
- **Mobile readability** — verified structurally during the Phase 1 browser pass, not
  re-checked guide by guide.
- **Real platform issues incorporated** — the guides describe real platform behaviour read
  from the code, but no issue from an actual customer deployment, because none has happened.
  The HelloUniversity cutover checklist is entirely unchecked and customer hosting is marked
  NO-GO in `docs/HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md`.
