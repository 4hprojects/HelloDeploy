# Phase 0: Read-only audit and inventory
No feature code changes or production mutations in this phase.

## Inspect
- Project architecture, versions, branches, deployment scripts, templates, routes, database stores, admin roles, CDN and hosting setup.
- Public routes and content: Terms, Privacy, AUP, About, Features, Docs, Blog, FAQ, Help, pricing, footer, contact, security, robots/sitemap.
- User flows: signup, authentication, OAuth scopes/tokens, GitHub disconnect, repo access, env secrets, deploy/build/run, logs, URL mapping, app stop/delete, account closure/requests, suspend/appeal.
- Isolation of untrusted app code and builds, per-user limits, disk/memory/CPU constraints, backup/restore capability, monitoring and audit logging.
- Third-party data flows: GitHub, Cloudflare, MongoDB Atlas, Resend, analytics/ads and any other actual provider, with processing purpose and location if known.
- Existing SEO, index coverage, consent, cookies, event analytics and AdSense plans.
- Actual contact channel, organization/legal operator and service limitations.

## Output
Create `docs/implementation/HELLODEPLOY_AUDIT.md` in project containing route/feature matrix with columns: capability, live status (verified/partial/planned/absent), code evidence, production verification, risk, action, priority. Separate static repository evidence from production-only claims. Create dependency map and prioritized remediation backlog; cite file paths and code line references where possible. Do not print credentials.

## Exit gate
No later-phase public assertions until relevant fact is verified. Surface blockers including absent operator details and uncertain user-data retention. Audit may reveal architecture unsafe for public untrusted deployments; if so, propose mitigations before expanding access.
