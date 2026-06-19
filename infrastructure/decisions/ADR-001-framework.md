# ADR-001: Web Framework and Template Engine

**Status:** Accepted  
**Date:** 2026-06-19

## Context

HelloDeploy needs a web framework and template engine for its server-rendered UI. The platform serves authenticated users managing deployments — not a public content site. The server is resource-constrained (single Ubuntu VPS).

## Decision

Use **Express** (v4) with **EJS** templates for the web application.

- JavaScript (ESM) throughout — no TypeScript
- Server-side rendering — no React, Vue, Vite, or Next.js for the platform UI
- Vanilla CSS with design tokens — no Tailwind, Bootstrap, or CSS-in-JS

## Rationale

- Minimal runtime overhead suits the self-hosted, resource-constrained target environment
- EJS is mature, well-understood, and requires no build step
- Avoids framework-specific complexity (hydration, SSR edge cases, build pipelines) that would obscure the deployment platform's own complexity
- TypeScript adds build steps and toolchain complexity disproportionate to the project's team size (one developer) and timeline

## Consequences

- No TypeScript type safety — mitigated by strict ESLint, JSDoc, and runtime validation
- All API inputs, job payloads, and environment config must be validated at runtime
- Template logic must remain simple; complex UI interactions will use small vanilla JS scripts
- **This decision may not be reversed without explicit owner approval and a replacement ADR**
