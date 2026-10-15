# Phase 1: Public Site, Trust, and Discovery

## Objective

Make `hellodeploy.online` explain the product clearly before signup and give visitors enough evidence to decide whether their application fits the platform.

## Current State

The current landing page already contains:

- a clear deployment headline
- Create Account and Sign In CTAs
- pilot/operator disclosure
- a four-step How It Works section
- six feature cards
- supported application types
- unsupported application types

This is a strong content baseline.

The main issue is that the page still reads more like a feature summary than a product experience.

## Problems to Solve

### 1. Technical framing appears too early

Current copy includes terms such as:

- self-hosted
- container image
- AES-256-GCM
- runtime detection

These are valid, but they should not be the first layer for a visitor who simply wants to know whether their app can be deployed.

### 2. No visual proof of the product

A hosting/deployment platform benefits from showing:

- project overview
- deployment progress
- live logs
- live URL
- domain setup

Use real HelloDeploy screenshots. Do not use mock UI that differs from production.

### 3. No public documentation hub

Create `/docs` or `/help`.

Minimum public topics:

- Getting Started
- Supported Applications
- GitHub Connection
- Environment Variables
- Deployment Process
- Domains
- Deploy Hooks
- Rollback
- Troubleshooting
- Service Limits
- FAQ

### 4. No clear public service-model page

Create a page explaining:

- current pilot/free status
- whether accounts are open
- supported project limits
- expected service availability
- backups/recovery scope
- support expectations
- future pricing status, if undecided

Do not invent commercial commitments.

### 5. Crawler accessibility must be verified

At the time of this review, automated retrieval of the main domain failed while a project subdomain was discoverable.

Add release checks for:

- `/`
- `/robots.txt`
- `/sitemap.xml`
- `/health`
- `/ready`

## Proposed Landing Page Information Architecture

### Section 1: Hero

H1 concept:

"Deploy your web app from GitHub without managing the deployment steps yourself."

Supporting copy:

"Connect a repository, review the detected setup, deploy, and get a live URL from one dashboard."

Primary CTA:

Create Account

Secondary CTA:

See How It Works

Tertiary link:

View Supported Apps

Avoid putting the full pilot disclosure inside the hero paragraph. Keep a compact pilot badge or trust row and link to details.

### Section 2: Product Preview

Show one real dashboard screenshot.

Annotate 3 areas:

- deployment status
- application address
- next action

Optional second screenshot:

Deployment detail with logs.

### Section 3: Compatibility

Title:

"Can HelloDeploy deploy your project?"

Two-column layout.

Supported:
- static HTML/CSS/JS
- Node.js
- Express
- React static build
- Vue static build
- constrained Next.js

Not currently supported:
- Python
- PHP
- Java
- Docker Compose
- arbitrary images
- privileged containers

CTA:
View full support matrix

### Section 4: How It Works

Keep the four steps, but rewrite each around the user's action.

1. Connect repository
2. Confirm app setup
3. Deploy
4. Open the live app

### Section 5: What HelloDeploy Handles

Group by outcome rather than infrastructure.

Deploy:
- GitHub integration
- build detection
- deployment history

Operate:
- environment variables
- live logs
- health checks
- rollback

Publish:
- project subdomain
- custom domains
- maintenance mode

Collaborate:
- roles
- audit trail

### Section 6: Trust

Compact cards:

- Encrypted secrets
- Account verification
- Deployment isolation
- Audit history
- Pilot status
- Operator/contact

Do not overstate security guarantees.

### Section 7: Public Documentation CTA

"Want to check the workflow before signing up?"

Buttons:
- Read Getting Started
- View Service Limits

### Section 8: Final CTA

"Ready to deploy a supported project?"

Primary:
Create Account

Secondary:
Sign In

## Navigation Proposal

Guest header:

- Product
- How It Works
- Docs
- Supported Apps
- Service Status
- Sign In
- Create Account

On small screens:
- menu toggle
- primary Create Account CTA remains easy to reach

## Footer Proposal

Product:
- How It Works
- Supported Apps
- Service Limits
- Status

Resources:
- Documentation
- FAQ
- Security
- Contact

Legal:
- Terms
- Privacy
- Cookies
- Acceptable Use
- Data Processing
- Copyright

Operator:
- Pilot information
- 4HProjects / operator information as appropriate

## Metadata Requirements

Each public page must define:

- unique title
- meta description
- canonical URL
- Open Graph title
- Open Graph description
- Open Graph image
- Twitter card metadata where useful

## Robots and Sitemap

Create/verify:

`/robots.txt`

Should not accidentally block public pages.

`/sitemap.xml`

Include only intended public pages.

Do not index:
- authenticated dashboard
- project settings
- admin pages
- private operational routes

## Acceptance Criteria

- Visitor can identify what HelloDeploy does without scrolling beyond the first major section.
- Supported and unsupported app types are available within one click from the hero.
- Public docs exist without authentication.
- Real product screenshots are used.
- Pilot/service-model information is clear without overwhelming the hero.
- `/`, `/robots.txt`, and `/sitemap.xml` return expected status publicly.
- Main public pages have unique metadata.
- Mobile header exposes all primary public navigation.
- Landing page is usable without JavaScript beyond optional enhancement.
