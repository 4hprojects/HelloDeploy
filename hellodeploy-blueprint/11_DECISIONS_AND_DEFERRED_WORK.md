# Decisions and Deferred Work

## Confirmed Decisions

| Decision                   | Selection                                            |
| -------------------------- | ---------------------------------------------------- |
| Product name               | HelloDeploy                                          |
| Planned domain             | `hellodeploy.online`                                 |
| Audience                   | General users                                        |
| Deployment engine          | Custom HelloDeploy implementation, not Coolify       |
| Web interface              | Node.js and Express with EJS templates               |
| Browser assets             | CSS and JavaScript served by Express                 |
| API                        | Versioned Express routes                             |
| Worker                     | Separate Node.js JavaScript service                  |
| Platform database          | MongoDB Atlas                                        |
| Queue                      | Redis and BullMQ                                     |
| Email                      | Resend                                               |
| Bot protection             | Cloudflare Turnstile                                 |
| Source provider            | GitHub App                                           |
| Runtime isolation          | Docker                                               |
| Reverse proxy              | Nginx                                                |
| Public ingress             | Cloudflare Tunnel                                    |
| Default deployment mode    | Manual                                               |
| Optional deployment mode   | Automatic from production branch                     |
| V1 runtimes                | Static and supported JavaScript/Node.js applications |
| User databases             | External MongoDB Atlas or Supabase PostgreSQL        |
| Project roles              | Owner, Maintainer, Viewer                            |
| Positioning                | Production project and MIT capstone candidate        |
| Styling                    | Standard CSS design system                           |
| Brand palette              | Deployment orange and baby blue                      |
| Foundation colors          | Infrastructure navy and slate                        |
| Success color              | Green, reserved for healthy/success states           |
| Themes                     | Light and dark                                       |
| Initial brand asset        | Replaceable placeholder icon and logo                |
| Authentication terminology | Create Account, Sign In, Forgot Password, Sign Out   |
| Recovery flow              | Email, verification code, new password               |

## Deferred Features

### Runtime Expansion

- Python
- PHP
- Java
- Custom buildpacks
- General Docker Compose

### Infrastructure Expansion

- Multiple deployment servers
- Remote HelloDeploy Agent
- High availability
- Load balancing across nodes
- Kubernetes
- Autoscaling

### Commercial Features

- Paid plans
- Billing
- Usage metering for invoices
- Promotional credits
- Service-level agreements

The quota model should remain plan-ready even though V1 is free.

### Storage and Data Services

- Managed databases
- Object storage service
- Persistent database volumes
- Automated user-data backups

### Advanced Deployment Features

- Pull-request previews
- Blue-green policies beyond the basic candidate-release switch
- Scheduled jobs
- Background worker products
- Private container registry deployment
- Multi-region routing

## Open Decisions for Later Phases

- Final software license for the distributable edition
- Whether Maintainers may manage environment variables by default
- Exact custom-domain Cloudflare onboarding mechanism
- Research methodology and participant sampling
- Final measured capacity and public pilot size
- Retention periods after empirical disk-growth testing
- Whether inactive applications will eventually sleep and wake on request
- Final HelloDeploy logo and icon artwork

## Change-Control Rule

When a deferred item is proposed:

1. Document the user need.
2. Assess security, capacity, and architectural impact.
3. Add an architecture decision record.
4. Update scope, workflows, data model, tests, and phases.
5. Obtain explicit approval before implementation.
