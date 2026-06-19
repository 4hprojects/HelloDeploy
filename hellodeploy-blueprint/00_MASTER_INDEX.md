# HelloDeploy Project Blueprint

## Purpose

This blueprint is the authoritative implementation reference for HelloDeploy. HelloDeploy is a self-hosted web application deployment platform that provides free, controlled hosting from an Ubuntu server. Users connect GitHub repositories, configure applications, and deploy isolated containers through a guided web interface.

HelloDeploy does not host user databases in Version 1. Users should connect their applications to managed services such as MongoDB Atlas or Supabase PostgreSQL.

## Confirmed Product Decisions

- Product domain: `hellodeploy.online`
- Target audience: general developers and project owners
- Positioning: production Hello ecosystem platform and MIT capstone candidate
- Hosting model: applications run on administrator-controlled Ubuntu servers
- V1 runtime support: static sites, Node.js, Express, React, Vue, and constrained Next.js
- Deferred runtimes: Python, PHP, and Java
- Isolation: one Docker container per deployed application release
- Public access: Nginx reverse proxy through Cloudflare Tunnel
- Authentication and platform data: MongoDB Atlas
- Email: Resend
- Bot protection: Cloudflare Turnstile
- Git integration: GitHub App
- Deployment default: manual
- Optional deployment mode: automatic deployment from the configured production branch
- User databases: external only
- Existing PM2 deployments remain untouched until explicitly migrated
- Future distribution: installable self-hosted edition for other server owners

## Document Map

1. [Product Scope](./01_PRODUCT_SCOPE.md)
2. [System Architecture](./02_SYSTEM_ARCHITECTURE.md)
3. [Roles and Permissions](./03_ROLES_AND_PERMISSIONS.md)
4. [Workflows](./04_WORKFLOWS.md)
5. [Data Model and API](./05_DATA_MODEL_AND_API.md)
6. [Security and Operations](./06_SECURITY_AND_OPERATIONS.md)
7. [Implementation Phases](./07_IMPLEMENTATION_PHASES.md)
8. [Testing and Acceptance](./08_TESTING_AND_ACCEPTANCE.md)
9. [Capstone Evaluation](./09_CAPSTONE_EVALUATION.md)
10. [Claude Implementation Guide](./10_CLAUDE_IMPLEMENTATION_GUIDE.md)
11. [Decision Log and Deferred Work](./11_DECISIONS_AND_DEFERRED_WORK.md)
12. [Development Stack and Standards](./12_DEVELOPMENT_STACK.md)
13. [UI, UX, Theme, and Brand Assets](./13_UI_UX_THEME_AND_BRAND.md)
14. [Authentication Experience Standard](./14_AUTHENTICATION_STANDARD.md)

## Recommended Technology Stack

| Layer                 | Technology                                              |
| --------------------- | ------------------------------------------------------- |
| Web interface         | Express with EJS templates, CSS, and browser JavaScript |
| Styling               | Standard CSS with reusable accessible components        |
| API                   | Versioned Express routes within the web application     |
| Deployment worker     | Separate Node.js JavaScript process                     |
| Job queue             | BullMQ with Redis                                       |
| Platform database     | MongoDB Atlas                                           |
| Authentication        | MongoDB-backed sessions with secure HTTP-only cookies   |
| Email                 | Resend                                                  |
| Abuse protection      | Cloudflare Turnstile and rate limiting                  |
| Source integration    | GitHub App and signed webhooks                          |
| Application isolation | Docker Engine                                           |
| Edge routing          | Nginx                                                   |
| Public ingress        | Cloudflare Tunnel                                       |
| Metrics               | Docker stats plus host metrics collector                |
| Structured logging    | JSON application and audit logs                         |

The HelloDeploy source code uses the same general development tools already used by the project owner: VS Code, JavaScript, Node.js, Express, EJS, npm, MongoDB Atlas, GitHub, Resend, and Cloudflare. TypeScript, React, and Vite are not required for the platform interface.

## Confirmed Visual Direction

- Interface: server-rendered EJS with standard CSS and browser JavaScript
- Brand colors: deployment orange and baby blue
- Infrastructure surfaces: navy and slate
- Success: green, reserved for healthy and successful states
- Themes: light and dark
- Brand asset: placeholder HelloDeploy mark until the final icon is approved
- Accessibility: status is communicated by text and icons in addition to color

## System Boundaries

HelloDeploy owns:

- Accounts, sessions, roles, and approvals
- Project configuration and team membership
- GitHub repository integration
- Deployment validation, queueing, builds, releases, and rollback
- Container lifecycle and quotas
- Domain routing
- Logs, metrics, notifications, and audit trails
- Administrative policies

HelloDeploy does not own in V1:

- User application databases
- Domain registration
- Git repository hosting
- Email inbox hosting
- Object storage as a service
- Multi-server orchestration
- Billing and payment collection
- Kubernetes orchestration

## Definition of MVP Success

The MVP is complete when a verified user can connect an approved GitHub repository, manually deploy a supported application, receive a working `*.hellodeploy.online` URL, inspect logs, redeploy, and roll back while the Super Admin can enforce quotas and suspend the application.

## Working Rules

- Implement phases sequentially unless a task explicitly permits parallel work.
- Do not implement deferred features without updating the decision log.
- Each phase must meet its acceptance criteria before the next phase begins.
- Security gates are blocking requirements, not optional enhancements.
- All secrets must remain encrypted or masked and must never enter logs.
- Infrastructure mutations must be performed by the worker, not directly by browser requests.
