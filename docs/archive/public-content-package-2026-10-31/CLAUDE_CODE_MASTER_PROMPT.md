# Copy/paste prompt for Claude Code

You are implementing the approved HelloDeploy Public Content Improvement Package in this repository. Read `00_READ_ME_FIRST.md` and all numbered Markdown plans in the package before editing. Cross-reference the working source of truth at https://docs.google.com/document/d/15AwcwFu-FueP8vjtDkmu0KJ-Pgi8GtDtyghoORY4R-M/edit if available, but do not require external access to proceed with the supplied package.

Start with a READ-ONLY repository/runtime audit as defined in `01_AUDIT_AND_INVENTORY.md`. Create the audit evidence and risk matrix. Only then implement phases in order, reusing and refining existing routes/components instead of duplicating them. You may autonomously choose the safest reasonable implementation details and continue between phases without asking me to micromanage. Use tests and update the changelog after every phase. Do not expose secrets. Avoid destructive migrations, uncontrolled infrastructure changes or disabling existing services.

HARD GATES: Stop and ask for actual authorization when publishing legal policy language needing qualified review, when initiating payments or needing real payment credentials, when enabling new paid plans, when making destructive user-data/production changes, or before deploying to production. Never invent legal-operator details, limits, security guarantees or payment destinations. If a phase is blocked, document it and continue independent safe work. No blanket production permission is conveyed by this prompt.

At the end report: audit findings, exact files changed, tests with results, screenshots or route samples when useful, items deferred, legal/operational approval requirements, and proposed release/rollback checklist. Keep an implementation journal so work can resume safely.
