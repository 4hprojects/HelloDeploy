# Testing and Acceptance

## Test Layers

### Unit Tests

- Permission decisions
- Quota resolution
- Status transitions
- Framework detection
- Domain normalization
- Secret redaction
- Nginx template rendering
- Deployment state machine

### Integration Tests

- MongoDB indexes and persistence
- Redis queue and retry behavior
- GitHub App token flow using mocks or test installation
- Resend adapter
- Docker build and container lifecycle
- Nginx validation and route activation
- Encryption and key-version handling

### End-to-End Tests

- Registration through verified login
- Project creation and GitHub connection
- Approval and manual deployment
- Optional automatic deployment
- Failed deployment preserving current release
- Rollback
- Membership permissions
- Suspension and reactivation
- Custom-domain verification
- Light and dark theme selection
- Mobile authentication and dashboard layouts
- Password visibility, validation, loading, and error behavior
- Three-step password recovery

### UI and Accessibility Tests

- Visible labels for all form controls
- Keyboard navigation and visible focus indicators
- Correct heading and landmark structure
- Status text and icon present without relying on color
- Regular text contrast of at least 4.5:1
- Essential component and graphic contrast of at least 3:1
- Functional layouts at 200% zoom
- Responsive layouts at mobile, tablet, desktop, and wide-dashboard sizes
- Reduced-motion behavior
- Long project names, domains, logs, and error messages do not break layouts
- Missing optional brand asset falls back safely to the placeholder mark

## Required Sample Applications

- Static HTML site
- Express API
- React static build
- Vue static build
- Next.js application within policy
- Intentionally broken build
- Application failing health check
- Application exceeding memory limit
- Unsupported Python project
- Repository containing modified Dockerfile

## Security Tests

- Horizontal and vertical authorization bypass
- CSRF and session fixation
- Brute-force and rate-limit behavior
- Webhook forgery and replay
- Secret leakage through logs and errors
- Command and argument injection
- Path traversal and malicious repository filenames
- Host-header and domain-claim attacks
- Container privilege and host-mount attempts
- Resource exhaustion and fork-bomb resistance within limits
- Nginx configuration injection

## Failure Recovery Tests

- MongoDB temporarily unavailable
- Redis restart during queued job
- Worker crash during build
- Docker daemon restart
- Candidate container failure
- Nginx validation failure
- Cloudflare Tunnel outage
- Disk threshold reached
- Server reboot

## Performance Tests

Measure rather than assume:

- Idle platform memory and CPU
- Build peak memory and CPU by framework
- Build duration
- Concurrent request handling per sample app
- Queue delay
- Container startup time
- Route-switch time
- Log and image disk growth
- Impact of one build on existing applications

## MVP Acceptance Scenario

1. Register and verify a general user.
2. Connect a GitHub repository.
3. Create a project and accept detected settings.
4. Submit for approval.
5. Super Admin applies a project quota override.
6. Owner manually deploys.
7. Application becomes reachable through a HelloDeploy subdomain.
8. Maintainer redeploys a newer commit.
9. Viewer observes status but cannot deploy.
10. A broken commit fails while the live release remains available.
11. Owner rolls back.
12. Super Admin suspends and reactivates the project.
13. User switches theme and completes the same workflow on a mobile viewport.

The MVP fails acceptance if any step requires manual editing of project-specific Nginx files or manual Docker commands under normal operation.

## Release Gates

### Alpha

- Local operation only
- One supported sample application
- Super Admin only
- No public registration

### Private Beta

- Verified invited users
- Manual deployments
- Platform subdomains
- Enforced quotas and logs

### Public Pilot

- Public registration
- Initial approval workflow
- Optional auto-deploy
- Custom domains after operational validation
- Published limits and acceptable-use policy

### Stable Self-Hosted Release

- Installer and upgrades
- Backup and restore
- Compatibility matrix
- Security and operations documentation
