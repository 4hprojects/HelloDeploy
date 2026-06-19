# Product Scope

## Product Statement

HelloDeploy lets a user host a supported web application from a GitHub repository without manually configuring Linux, Docker, Nginx, ports, TLS, or Cloudflare Tunnel. The platform is optimized for controlled free hosting on resource-constrained, administrator-owned infrastructure.

## Primary Users

### General User

A registered person who can create project drafts, connect GitHub, request initial approval, deploy approved projects, and invite project members.

### Project Owner

The user with full project-level authority. Ownership is assigned when a project is created and can be transferred through an audited operation.

### Maintainer

A project member who can operate deployments and inspect logs but cannot transfer ownership, delete the project, or independently change sensitive infrastructure settings.

### Viewer

A read-only member who can view project status, deployment summaries, and sanitized logs.

### Admin

A platform operator with delegated powers for user review, project review, deployment intervention, and support. Admin permissions are explicitly granted by the Super Admin.

### Super Admin

The operator with platform-wide control, including quotas, server operations, policies, secrets configuration, and administrative role assignments.

## V1 Functional Scope

### Accounts

- Public registration
- Email verification through Resend
- Cloudflare Turnstile on registration and sensitive unauthenticated forms
- Login, logout, password reset, session revocation
- Account status: pending verification, active, suspended, rejected, archived
- Profile and notification preferences
- Shared Hello ecosystem authentication layout and terminology
- Three-step password recovery using email, verification code, and new password

### Projects

- Create project draft
- Assign unique project slug
- Connect one GitHub repository
- Choose a production branch
- Detect supported framework
- Configure build command, start command, output directory, and application port
- Store encrypted environment variables
- Assign free platform subdomain
- Request one custom domain
- Invite project Maintainers and Viewers
- Archive and restore projects

### Deployments

- First deployment requires approval
- Manual deployment is default
- Optional automatic deployment for the configured branch
- Deploy latest commit
- Deploy a selected commit when available
- Redeploy current commit
- Deploy without build cache
- Cancel queued deployment
- View build and runtime logs
- Retain three rollback releases by default
- Roll back to a locally retained healthy release

### Hosting

- Static sites
- Node.js and Express applications
- React and Vue static builds
- Next.js applications under stricter quotas
- Docker container isolation
- Nginx routing
- Cloudflare Tunnel ingress
- Health checks
- Per-container CPU, memory, storage, and process restrictions

### Administration

- Platform dashboard
- User and project review
- Deployment queue management
- Resource quota management
- User-level and project-level quota overrides
- Server health and capacity monitoring
- Domain and routing administration
- Application suspension and restoration
- Audit logs
- Maintenance mode and announcements

## Default Free Limits

| Resource                            |      Default |
| ----------------------------------- | -----------: |
| Owned projects                      |            1 |
| Simultaneously running applications |            1 |
| Project members                     | Owner plus 2 |
| Memory                              |       256 MB |
| CPU                                 |    0.25 core |
| Writable project storage            |       500 MB |
| Deployments per month               |           10 |
| Build timeout                       |    5 minutes |
| Custom domains                      |            1 |
| Retained rollback releases          |            3 |
| Log retention                       |       7 days |

Quota resolution order:

1. Project-specific override
2. User-specific override
3. Plan default

Hello ecosystem projects may receive higher project-specific limits without changing the owner's general allocation.

## Deployment Modes

### Manual

- Default for all new projects
- GitHub pushes update the available commit indicator only
- Owner or Maintainer explicitly starts deployment

### Automatic

- Enabled by the Owner after approval
- Only the configured production branch triggers deployment
- Can be disabled at any time
- High-risk configuration changes pause deployment for review

### Approval Required

- Admin approval is required for every deployment
- Intended for restricted or high-risk projects

## Changes Requiring Review

- Repository replacement
- Production branch change
- Dockerfile addition or modification
- Build or start command change
- Application port change
- Resource increase request
- Persistent storage configuration
- Custom domain assignment
- Network policy change

Ordinary source-code commits do not require a new administrative review.

## External Database Policy

Recommended providers:

- MongoDB Atlas
- Supabase PostgreSQL

HelloDeploy may store and inject encrypted connection values such as `MONGODB_URI`, `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. It does not create, administer, back up, or guarantee the availability of user databases.

## Inactivity Policy

- Notify owner after 60 days without meaningful traffic or deployment activity
- Permit Super Admin suspension at 90 days
- Never automatically delete projects
- Archival and deletion require an authorized action and audit record

## Non-Functional Requirements

- Responsive and usable on desktop and mobile
- Accessible keyboard navigation and form labels
- Auditable privileged actions
- Recoverable deployments
- Idempotent worker jobs where practical
- Clear user-facing errors without exposing sensitive infrastructure details
- Capacity-aware scheduling for low-resource servers
- Configuration-driven portability
- Consistent light and dark visual themes
- Responsive server-rendered EJS interface using standard CSS
- Brand assets replaceable without editing templates

## Explicitly Out of Scope for V1

- Python, PHP, and Java hosting
- Database hosting
- Docker Compose submitted by users
- Arbitrary registry images
- Privileged containers
- GPU workloads
- Game servers
- Video encoding and large file hosting
- Cryptocurrency mining
- Public proxy or VPN hosting
- Autoscaling
- Multiple deployment nodes
- Billing
- Usage-based payments
- High-availability guarantees
