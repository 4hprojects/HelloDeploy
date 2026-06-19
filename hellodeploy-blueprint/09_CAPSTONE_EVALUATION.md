# Capstone Evaluation

## Proposed Project Title

HelloDeploy: A Lightweight Self-Hosted Platform for Guided Web Application Deployment on Resource-Constrained Infrastructure

The final academic title should be refined after the problem-validation and literature-review stages.

## Proposed Research Problem

Developers with limited deployment experience may face configuration errors, long setup times, and dependency on paid or externally managed hosting platforms. Small institutions and individuals may also possess underused local hardware but lack a controlled system for hosting multiple applications safely.

The study should evaluate whether HelloDeploy improves deployment outcomes while operating within measured resource constraints.

## Possible Research Questions

1. How does HelloDeploy affect deployment completion time compared with a documented manual Ubuntu deployment process?
2. How does HelloDeploy affect deployment success and configuration-error rates?
3. How usable is HelloDeploy for users with varying deployment experience?
4. What application load can the target low-cost server support under defined quotas?
5. How effectively do validation and guided diagnostics help users correct failed deployments?

## Evaluation Variables

### Independent Variable

- Deployment method: HelloDeploy versus documented manual deployment

### Dependent Variables

- Completion time
- Successful deployment rate
- Number and type of configuration errors
- Number of administrator interventions
- Task completion rate
- Usability score
- User satisfaction
- CPU, RAM, disk, and build-time consumption

### Control Variables

- Same sample applications
- Same server or equivalent test environment
- Same network assumptions
- Same task instructions
- Defined user-experience groupings

## Instrumentation Requirements

Build these into the platform from the start:

- Deployment stage timestamps
- Failure categories
- Retry count
- Validation findings
- Administrator intervention count
- Resource snapshots during build and runtime
- User-visible diagnostic events
- Anonymous or consented usability-event measurements

Do not collect research data without the required consent, ethics process, and privacy documentation.

## Suggested Evaluation Design

- Controlled task-based comparison
- Participants deploy equivalent applications using manual instructions and HelloDeploy
- Counterbalance task order where feasible
- Collect system metrics, task outcomes, and usability responses
- Analyze quantitative results and summarize qualitative feedback

## Possible Instruments

- System Usability Scale or another justified usability instrument
- Task-completion observation sheet
- Deployment-error classification checklist
- Post-task questionnaire
- Semi-structured interview prompts where methodology permits

## Capstone Deliverables

- Requirements and design documentation
- Working HelloDeploy prototype
- Security and threat model
- Deployment and administrator manual
- Test and capacity results
- Research instrument and dataset plan
- Evaluation results
- Limitations and future-work analysis

## Claims to Avoid Without Evidence

- Production-grade security
- Unlimited hosting capacity
- Guaranteed uptime
- Better usability than alternatives
- Lower cost in all environments
- Replacement for Render, Coolify, Vercel, or institutional cloud services

## Evidence-Based Contribution

The defensible contribution is a measured, guided, quota-controlled deployment platform designed for self-hosted and resource-constrained environments, not merely another generic hosting dashboard.
