---
id: lh-what-is-devsecops
slug: what-is-devsecops
title: "What Is DevSecOps? A Beginner's Guide to Secure Software Deployment"
description: Learn what DevSecOps means, where security checks belong from planning to production, and how a small team can start without slowing down.
category: web-security
tags: [devsecops, security, ci-cd, threat-modeling, beginners]
authorId: henson-sagorsor
status: published
publishedAt: '2026-11-20'
difficulty: beginner
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/what-is-devsecops.png
references:
  - title: NIST SP 800-218 — Secure Software Development Framework (SSDF) Version 1.1
    url: https://csrc.nist.gov/pubs/sp/800/218/final
  - title: NIST — Secure Software Development Framework project
    url: https://csrc.nist.gov/projects/ssdf
  - title: OWASP DevSecOps Guideline
    url: https://owasp.org/www-project-devsecops-guideline/
  - title: OWASP Software Assurance Maturity Model (SAMM) — The model
    url: https://owaspsamm.org/model/
  - title: OWASP Threat Modeling Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html
  - title: OWASP CI/CD Security Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html
  - title: CISA — Secure by Design principles and approaches
    url: https://www.cisa.gov/resources-tools/resources/secure-by-design
  - title: GitHub Docs — About secret scanning
    url: https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning
  - title: GitHub Docs — About Dependabot security updates
    url: https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates
  - title: GitHub Docs — About code scanning
    url: https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning
---

Many teams treat security as the last step before launch: build the app, then ask someone to "check it for security". By then the design is fixed, the deadline is close, and every problem is expensive to change. DevSecOps is the habit of moving those checks into the everyday work of building and shipping software, so problems are found while they are still small.

This guide explains the idea without assuming you are a security specialist. It focuses on what DevSecOps asks you to do, not on any particular product.

## What you will learn

By the end of this guide you should be able to:

- **Explain** what DevSecOps means and how it differs from a security review at the end of a project.
- **Identify** which security activity belongs at each stage, from planning to running in production.
- **Choose** a small, realistic starting set of automated checks for a personal or small-team project.
- **Recognize** what automated tools cannot find, so you know when a human review is still needed.

## Before you begin

You should know what a Git repository is and have a rough idea of how code gets from your laptop to a server. If you have never deployed an application, read [How to Deploy a Node.js Application](/blog/how-to-deploy-nodejs-app) first. No security background is needed; terms are explained as they come up.

## What DevSecOps means

The name joins three words:

- **Dev** (development): writing and changing the software.
- **Sec** (security): protecting the software, its data, and its users.
- **Ops** (operations): building, deploying, and running the software.

DevOps already describes development and operations working as one loop, usually with automation: every change is built, tested, and deployed through a **pipeline**, an automated sequence of steps that runs whenever code changes. DevSecOps adds security to that same loop. Instead of a separate security phase, small security checks run alongside the existing build and test steps, and everyone on the team shares responsibility for them.

You will often hear this described as **shifting left**. Picture the project timeline drawn from left (planning) to right (production). Shifting left means moving security work earlier. The OWASP DevSecOps Guideline puts its goal plainly: detect security issues, whether design flaws or application vulnerabilities, as early and as cheaply as possible, and keep detecting them continuously. That last part matters. DevSecOps is not only "earlier"; it is also "always", because new vulnerabilities are regularly discovered in software that had no known problems yesterday.

## Why it matters

Consider a small, realistic scenario. A developer adds a payment API key to a configuration file to test something quickly and commits it. Two weeks later, before launch, a security review finds the key in the repository.

- **Found at the end:** the key has been in Git history for two weeks, and every clone of the repository has a copy. It must be rotated (replaced with a new key and the old one revoked), the history checked, and the provider's logs reviewed for misuse. The launch slips.
- **Blocked at the push:** push protection, a feature of some secret scanners, refuses the push because it contains a key. The developer removes the key from the commit itself (editing the commit, not adding a new one on top), moves it to an environment variable, and pushes again. The key never leaves their laptop.
- **Flagged just after the push:** if the scanner only alerts, the key is already in the shared repository and must still be rotated, but within minutes instead of weeks, before anyone has had much chance to copy it.

The mistake is identical; only the moment it is caught differs. That is the core argument for DevSecOps: the earlier a problem is found, the less it costs to fix and the fewer people it affects.

There is a second benefit. When checks run automatically on every change, security stops depending on one person remembering to look. The pipeline remembers for you.

## Security across the delivery lifecycle

DevSecOps is easiest to understand stage by stage. The table shows typical activities; you do not need all of them on day one.

| Stage   | Question to ask                         | Example activity                                                        |
| ------- | --------------------------------------- | ----------------------------------------------------------------------- |
| Plan    | What could go wrong with this feature?  | A short threat model before building                                    |
| Code    | Am I introducing an obvious flaw?       | Code review; keeping secrets out of the repository                      |
| Build   | Are my dependencies and code safe?      | Dependency scanning (SCA) and static analysis (SAST)                    |
| Test    | Does the running app behave safely?     | Dynamic testing (DAST) against a test environment                       |
| Release | Can I trust what I am deploying?        | Locked dependency installs; deployment credentials with minimal rights  |
| Operate | Would I notice an attack or a new flaw? | Patching, logging, monitoring, and a plan for responding to an incident |

Each activity is explained below. The acronyms in the Build and Test rows describe kinds of automated tools:

- **SCA (software composition analysis)** checks the open-source packages you depend on against databases of known vulnerabilities. `npm audit` and Dependabot are SCA tools.
- **SAST (static application security testing)** reads your source code without running it and looks for risky patterns, such as user input flowing into a database query. GitHub code scanning with CodeQL is one example.
- **DAST (dynamic application security testing)** sends requests to a running copy of your application and watches how it responds, much as an attacker would.

### Plan: a threat model in four questions

A **threat model** sounds formal, but at its simplest it is a short conversation before you build something. The OWASP Threat Modeling Cheat Sheet, following the Threat Modeling Manifesto, frames it as four questions:

1. What are we working on?
2. What can go wrong?
3. What are we going to do about it?
4. Did we do a good enough job?

If "what can go wrong?" feels too open, break it into three smaller questions: what is valuable, who can reach it, and what would hurt most. The [Node.js security guide](/blog/secure-nodejs-before-production) uses exactly that breakdown.

For a "reset password" feature, ten minutes on these questions might surface that reset links must expire, must work only once, and must not reveal whether an email address has an account. Those are design decisions. No scanner would find their absence later, which is why the planning stage matters.

### Release and operate: the pipeline is part of production

A pipeline that can deploy to production is as valuable to an attacker as the production server itself. The OWASP CI/CD Security Cheat Sheet treats the pipeline as an attack surface: limit who can change workflows, give deployment credentials only the permissions they need (the principle of **least privilege**), and review third-party build steps before trusting them. After release, operations work such as applying security updates and watching logs is where DevSecOps keeps detecting continuously.

## A realistic starting point for a small team

Large organizations run dozens of tools. A student project or a two-person team needs far less. If your code is on GitHub, this set covers the most common mistakes with little setup:

1. **Turn on secret scanning.** GitHub secret scanning detects many known credential formats in repositories, and push protection can block a push that contains one.
2. **Turn on dependency alerts and updates.** Dependabot opens pull requests that upgrade a vulnerable dependency to a fixed version.
3. **Add code scanning.** GitHub code scanning runs static analysis, such as CodeQL, on pushes and pull requests and shows findings in the pull request.
4. **Install from the lockfile in your pipeline.** Running `npm ci` installs the exact versions recorded in `package-lock.json`, so the build uses what you reviewed and tested. (On the production server you would add `--omit=dev` to skip development tools; the pipeline usually needs them to run tests.)
5. **Require a review before merging.** A second person reading each change catches logic problems that tools miss. On a solo project, open a pull request anyway and read your own diff before merging; the change looks different on the review page.
6. **Write the threat model down.** A few lines per feature in the pull request description is enough.

Availability of some GitHub security features depends on whether the repository is public and on your plan; check the GitHub documentation linked below for your account. Equivalent tools exist for GitLab, Bitbucket, and self-hosted CI systems.

Start with these, fix what they report, and only then add more. A pipeline that produces hundreds of ignored warnings is worse than one that produces five you act on.

For the application itself, [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production) turns these ideas into a concrete pre-launch checklist.

## Frameworks you will hear about

You do not need to adopt a formal framework to practice DevSecOps, but these names come up often and are worth recognizing:

- **NIST Secure Software Development Framework (SSDF).** Published as NIST SP 800-218, version 1.1, in February 2022. It groups secure development practices into four areas: Prepare the Organization (PO), Protect the Software (PS), Produce Well-Secured Software (PW), and Respond to Vulnerabilities (RV). NIST describes the practices as outcome-based rather than a checklist to follow.
- **OWASP Software Assurance Maturity Model (SAMM).** A model, currently version 2, for measuring and improving a security program across five business functions: Governance, Design, Implementation, Verification, and Operations. It helps a team see where it is weakest.
- **OWASP DevSecOps Guideline.** A vendor-neutral description of the security steps in a delivery pipeline, from secret scanning and SCA to DAST and supply chain checks.
- **CISA Secure by Design.** Guidance from the US Cybersecurity and Infrastructure Security Agency, first published in April 2023 and revised in October 2023. Its three principles are to take ownership of customer security outcomes, embrace radical transparency and accountability, and lead from the top. It is aimed at software makers, and it argues that products should be secure out of the box rather than relying on customers to configure them safely.

## Common mistakes and misconceptions

- **"We bought a security tool, so we do DevSecOps."** Tools are only useful if someone reads and acts on their results. DevSecOps is mainly a way of working.
- **"Security is the security team's job."** In DevSecOps the people who write and deploy the code own most of the everyday checks. Specialists help design the system and handle the hard cases.
- **"If the scanners pass, the app is secure."** Scanners are good at known patterns: a vulnerable package version, a hard-coded key, an unsafe function call. They are poor at logic flaws, such as one user being able to view another user's invoice by changing an ID in the URL. Design review and testing still matter.
- **"Every finding must block the build."** Blocking on every low-severity warning trains people to bypass the pipeline. Block on serious, high-confidence findings; track the rest.
- **"We will add security after launch."** Retrofitting checks into a large codebase produces a flood of old findings. Starting small and early is easier.

## Check your understanding

Try to answer each question before reading the answers below.

1. In one sentence, what is the difference between a final security review and DevSecOps?
2. Your dependency scanner reports no known vulnerabilities. Does that mean users cannot see each other's data?
3. Which stage is the best place to decide that password reset links must expire, and why?
4. A teammate wants the pipeline to fail on every warning from every tool. What is the risk?

**Answers**

1. A final review checks security once at the end; DevSecOps builds checks into every stage and automates the repeatable ones so they run on every change.
2. No. SCA only finds known flaws in packages. Access control between users is application logic that needs design review and testing.
3. Planning, during threat modeling. It is a design decision, and no scanner will notice that a requirement is missing.
4. Constant failures on minor issues lead people to ignore or bypass the pipeline. Block only on serious findings and track the rest.

## Key takeaways

- DevSecOps builds security into the same automated loop that builds, tests, and deploys your code.
- Problems found earlier are cheaper to fix and affect fewer people.
- Each stage has its own job: threat model while planning, scan while building, monitor while operating.
- A small team can start with secret scanning, dependency updates, code scanning, lockfile installs, and code review.
- Automated tools miss logic and design flaws, so human review remains part of the process.

## Related guides

- [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production)
- [How to Deploy a Node.js Application: A Beginner's Step-by-Step Guide](/blog/how-to-deploy-nodejs-app)
