# Phase 4 Case Study QA

## Result, 28 September 2026: cannot be started

Every item below is unchecked, and that is the accurate state rather than an
omission.

No project has completed a deployment through HelloDeploy. The evidence is the
repository's own: `/etc/nginx/hellodeploy.d/`, where the worker writes a config
per successfully deployed project, was found completely empty on 2026-08-15 —
recorded in `docs/PRIORITIES.md` as "no project has ever completed a real
deploy" — and the same file records that every HelloUniversity pipeline attempt
failed. The HelloUniversity cutover checklist in the production plan is entirely
unchecked, and customer application hosting is marked NO-GO.

So the three case studies describe deployments that have not happened. The
evidence checklist below has nothing to verify against, and writing to it anyway
would mean inventing the project's stack, its problems and their resolutions —
which the accuracy section forbids and which a reader has no way to check.

What has been completed instead is everything in this phase that does not depend
on a deployment: the case study template now matches the platform, the evidence
gate states the conditions that unblock each study, the screenshot plan uses the
real architecture and warns that log redaction is pattern-based, and the privacy
rules say why a log that looks redacted may still carry secrets.

Phases 1, 2, 3 and 5 are built and live: sixteen public pages, fifteen
documentation pages, eighteen Learn articles and fourteen troubleshooting
guides. Phase 4 is the only one outstanding, and it is waiting on a deployment
rather than on writing.
## Required Case Studies

- [ ] HelloUniversity
- [ ] HelloRun
- [ ] HelloPera

A case study should not be published until enough verified evidence exists.

## Evidence

For each case study:

- [ ] Current project URL verified
- [ ] Current stack verified
- [ ] Runtime verified
- [ ] Database verified
- [ ] Build configuration verified
- [ ] Start configuration verified
- [ ] Port behavior verified
- [ ] Environment variable categories verified
- [ ] Domain setup verified
- [ ] HTTPS verified
- [ ] Problems and fixes verified

## Accuracy

- [ ] No planned feature described as current
- [ ] No invented performance numbers
- [ ] No invented cost savings
- [ ] No invented user counts
- [ ] No unsupported uptime claims
- [ ] No exaggerated success language

## Originality

Each case study should include:

- [ ] Real project information
- [ ] At least one original architecture diagram
- [ ] At least two useful original screenshots where available
- [ ] At least one real deployment lesson
- [ ] At least one real problem and resolution when available

## Security

- [ ] Secrets removed
- [ ] Deploy hook URLs removed
- [ ] OAuth secrets removed
- [ ] Database credentials removed
- [ ] Private tokens removed
- [ ] Logs sanitized
- [ ] Screenshots reviewed

## SEO

- [ ] Unique page title
- [ ] Unique meta description
- [ ] One H1
- [ ] Canonical URL
- [ ] Open Graph metadata
- [ ] Breadcrumbs
- [ ] Article schema where appropriate
- [ ] Author
- [ ] Published date
- [ ] Updated date

## Internal Links

- [ ] Relevant Docs links
- [ ] Relevant Learn links
- [ ] Relevant Product link
- [ ] No broken links

## Final Review Question

Can a reader understand exactly what HelloDeploy did in this deployment without the article overstating what the platform supports?

If not, revise before publication.
