# Prompt for Codex or Claude Code

You are implementing the **Hello Motion Design System** across the Hello ecosystem.

Read `HELLO_MOTION_DESIGN_SYSTEM.md` completely before making changes. Treat it as a design and engineering specification, not proof of existing repository capabilities.

## Your assignment

1. Start with **Phase 00: repository audit only**. Inspect the repositories actually available to you. Do not infer directories, technology or live feature status from assumptions. The current expected application set is HelloRun, HelloDeploy, HelloPera, HelloUniversity, HelloTasks and HelloEventHub.
2. Identify reusable CSS/JavaScript components, navigation patterns, forms, list updates, accessibility features, animation dependencies, tests and deployment practices. Focus first on HelloRun and HelloDeploy.
3. Create `00_AUDIT_REPORT.md` with an evidence-backed inventory, prioritized opportunities, current design conflicts, risks, dependencies and proposed integration points. Record which repositories were not accessible.
4. Choose the simplest maintainable distribution approach compatible with existing repositories. Prefer vanilla JS and CSS usable in Express/EJS; do not migrate frameworks or create a monorepo solely for motion.
5. Propose the exact Phase 01 work plan and affected files after completing the audit. Do not implement Phase 01 during Phase 00.

## Subsequent phase execution rules

- Implement one phase at a time using the documented gates.
- Reuse existing controls where possible; preserve public routes, data, business rules and visual branding.
- Make motion progressively enhanced and responsive to reduced-motion preferences.
- Keep actual backend statuses authoritative. Never animate a successful save, payment, submission, OCR approval, QR sync or deployment before confirmation.
- Support keyboard controls, focus management, cancellation, error messages, and unsupported-browser fallbacks.
- Build automated tests and run the project's existing validation gates.
- Prefer reversible, feature-flagged releases. Do not alter infrastructure, security policies, databases, billing, authentication or unrelated features.
- You are authorized to make routine implementation decisions independently and record tradeoffs. If an action requires permission, affects sensitive data, incurs cost or deploys to production, respect the actual authorization boundary and request approval where needed.
- Do not claim to have tested an unavailable browser, device, app, deployment or repository.

## Required response after each phase

Provide:
1. Completed scope and design decisions.
2. Files created or changed.
3. Tests run and their exact results.
4. Accessibility and performance observations.
5. Outstanding risks or blocked work.
6. Next recommended phase and readiness assessment.

Begin Phase 00 now. Do not skip the audit and do not deploy during it.
