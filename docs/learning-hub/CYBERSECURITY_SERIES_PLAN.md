# HelloDeploy Cybersecurity Education: Article-by-Article Implementation Plan

> **Status 2026-11-25: done.** All ten queued articles were published on 2026-11-20 (#227–#237),
> with an eleventh on backups. Verification records are in
> [ARTICLE_VERIFICATION.md](ARTICLE_VERIFICATION.md). Only the evergreen expansion backlog in
> section 9 remains, and it is written on request. Moved from `docs/todo/` on 2026-11-25.

**Project:** HelloDeploy.online  
**Document type:** Editorial and implementation guide  
**Version:** 1.0  
**Prepared:** 20 November 2026  
**Primary objective:** Help readers learn cybersecurity through clear explanations, accurate examples, and practical application.

---

## 1. Purpose

Build a cybersecurity learning section for HelloDeploy, publishing **one complete article at a time**. Every article must teach a useful security concept, explain why it matters, and help a reader apply or evaluate it.

The series must not become a collection of thin SEO posts, promotional landing pages, or unverified trend summaries. Search visibility supports discoverability, but **learning is the primary outcome**.

**A successful article enables readers to:**

1. Explain the topic in their own words.
2. Recognize a relevant real-world problem or risk.
3. Choose or perform a practical, defensible action.
4. Understand what the guidance does _not_ guarantee.
5. Identify trustworthy sources for deeper learning.

## 2. Target Audience

### Primary readers

- **Students and beginners:** Need definitions, examples, and explanations of unfamiliar terms.
- **Junior to intermediate web developers:** Need secure coding and deployment guidance for real projects.
- **Self-hosters, system administrators, and small teams:** Need practical approaches to operating applications safely.

### Secondary readers

- **IT instructors and trainers:** Need accurate, reusable teaching explanations and exercises.
- **Technical founders and website owners:** Need to understand security decisions without excessive jargon.

Do not assume all readers are cybersecurity specialists. Introduce prerequisite concepts before complex advice. Where relevant, offer a short beginner path and an optional deeper technical section.

## 3. Editorial Tone and Style

**Tone:** Educational, approachable, precise, practical, calm, and evidence-based.

**Voice:** A knowledgeable technical instructor who explains rather than lectures or sells.

**Writing rules:**

- Speak directly to the reader using **you** and **your**.
- Use short paragraphs, plain language, descriptive headings, and active voice.
- Define technical terms when first used. Expand acronyms on first mention.
- Explain **what**, **why**, **how**, and **when** a concept matters.
- Use realistic examples and step-by-step demonstrations where useful.
- Explain tradeoffs, limitations, and common misconceptions.
- Separate observed facts from projections and recommendations.
- Prefer neutral, measured claims over fear-based headlines.
- Use code examples only when technically correct, secure for the stated context, and accompanied by explanations.
- Never fabricate statistics, exploit details, CVEs, quotes, test results, or references.
- Avoid hype, exaggerated certainty, keyword stuffing, and unsubstantiated statements such as “100% secure.”
- Avoid promotional language inside teaching sections. Mention HelloDeploy only where a genuine deployment example or relevant internal link helps the reader.

### Sample framing

**Preferred:** “An environment variable keeps a secret outside your source code, but it does not automatically prevent that secret from appearing in logs or deployment settings.”

**Avoid:** “Environment variables make your app completely secure. Deploy instantly with HelloDeploy!”

## 4. Educational Objectives by Article Category

| Category                  | What the reader should learn                                                 | Suggested learning activity                                     |
| ------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Foundations               | Explain core concepts and recognize common vulnerabilities                   | Short scenario or knowledge check                               |
| Secure development        | Identify and prevent risks in application code                               | Review an illustrative vulnerable pattern and safer alternative |
| Deployment and operations | Apply checks to deployment configuration and operations                      | Follow a checklist or controlled tutorial                       |
| Current threats           | Distinguish confirmed risks from headlines and understand defensive actions  | Analyze a documented case with linked sources                   |
| Future-facing security    | Understand the current state of emerging practices and possible implications | Compare adoption scenarios, limits, and prerequisites           |

**Each article requires 3–5 measurable learning outcomes**, using verbs such as _identify, explain, compare, configure, verify,_ or _evaluate_.

## 5. One-Article-at-a-Time Publishing Policy

**Strict sequential workflow:**

1. Select **only the next article** in the approved queue, unless the owner explicitly reprioritizes.
2. Research that article using primary and trustworthy sources.
3. Prepare a brief covering search intent, audience, learning outcomes, prerequisites, outline, examples, and references.
4. Draft **one article** in Markdown or the format already used by the site's content system.
5. Perform technical fact-checking, instructional review, accessibility review, and SEO review.
6. Inspect the HelloDeploy codebase and existing article/content architecture **before implementation**, if repository access is available.
7. Implement **only the selected article** and any strictly necessary shared-content integration. Do not refactor unrelated systems.
8. Run relevant validation, tests, link checks, and a rendered-page review when possible.
9. Record what was changed, verification results, open issues, and the proposed next article.
10. **Stop after this one article.** Do not write or publish article two until article one has been reviewed and explicitly approved for continuation.

**Publication gate:** Drafting and deploying are distinct. Do not automatically publish or deploy a draft without the site owner's authorization. The next article requires a separate go-ahead.

**No batch generation:** The article backlog is a plan, not authorization to generate all articles.

## 6. Article Requirements and Standard Template

Each article should follow a teaching-first structure, adapting as needed for the topic.

```markdown
---
title: '[Clear, specific, accurate title]'
slug: '[descriptive-kebab-case-slug]'
summary: '[One- or two-sentence factual summary]'
category: '[Cybersecurity / DevSecOps subcategory]'
tags: ['[tag-1]', '[tag-2]']
audience: ['[primary reader groups]']
level: 'Beginner | Intermediate | Advanced'
status: 'draft'
# Add publishedAt and updatedAt only when those events actually occur.
# Map metadata to the existing site's schema before implementation.
---

# [Article title]

[Open with the problem and a clear explanation of what readers will learn.]

## What you will learn

- [Measurable outcome 1]
- [Measurable outcome 2]
- [Measurable outcome 3]

## Before you begin

[Prerequisites and any safe practice environment needed.]

## [What the concept means]

[Definition and explanation.]

## [Why it matters]

[Concrete scenario and practical consequences.]

## [How it works or how to apply it]

[Accurate walkthrough, annotated example, or defensible checklist.]

## Common mistakes and misconceptions

[What commonly goes wrong and why.]

## How to verify your understanding

[2–4 practical review questions, checks, or a small safe exercise.]

## Key takeaways

[3–5 concise learning points.]

## Further reading and sources

- [Authoritative source title](https://example.org/actual-verified-page)

## Related learning

[Only real, existing internal article links.]
```

**Template note:** The sample `example.org` link is a placeholder for the writer, never a publishable citation. Remove all placeholders before approval.

### Article length

- **Concept explainer:** usually 1,000–1,600 words.
- **Practical tutorial:** usually 1,500–2,500 words, depending on steps and code.
- **Evidence-based trend analysis:** usually 1,200–2,000 words.

These are guidelines, not quotas. Use the length needed to teach the topic clearly.

### Code and demonstration standards

- State tested runtime and dependency versions when version-specific behavior matters.
- Explain commands and important configuration lines.
- Prefer safe, reproducible local or test-environment demonstrations.
- Never include real tokens, passwords, private keys, or sensitive application data.
- Do not advise readers to expose a live service solely to demonstrate a vulnerability.
- Clearly distinguish illustrative snippets from complete production configurations.
- Include verification steps, expected behavior, and rollback guidance for operational changes where relevant.

## 7. Research and Accuracy Standards

**Preferred primary sources:**

- OWASP: https://owasp.org/
- OWASP Cheat Sheet Series: https://cheatsheetseries.owasp.org/
- CISA: https://www.cisa.gov/
- NIST Computer Security Resource Center: https://csrc.nist.gov/
- Node.js documentation: https://nodejs.org/en/learn
- Express documentation: https://expressjs.com/
- GitHub security documentation: https://docs.github.com/en/code-security
- Ubuntu documentation: https://documentation.ubuntu.com/
- Nginx documentation: https://nginx.org/en/docs/

**Verification process:**

1. Check standards and technical details against current authoritative documentation.
2. For news, incidents, and trends, record the **publication date** and **date of the event** when different.
3. Confirm named versions, CVE identifiers, statistics, and claims directly against original sources.
4. Cite support close to the relevant claim and include readable references.
5. Avoid unsupported claims about HelloDeploy's actual security features or deployment behavior.
6. Revisit technical steps whenever major software or standards change.

Do not copy long source passages. Explain concepts in original language and attribute sources.

## 8. SEO and Discoverability: Secondary to Learning

- Match the article title and introduction to a specific educational search intent.
- Use a unique descriptive slug, concise meta description, and one clear H1.
- Organize material with informative H2/H3 headings, not mechanical keyword repetition.
- Link to relevant pre-existing content where it genuinely clarifies a prerequisite or next step.
- Build a useful cybersecurity category/hub only when supported by the current architecture.
- Add appropriate Article or BlogPosting structured data if the existing site supports it.
- Use meaningful alt text for informative figures. Do not use decorative images as substitutes for explanation.
- Make sources, author information, and publication/review dates visible if supported.
- Never create fictional internal links or display artificial update dates.

**Suggested learning hub:** `/blog/cybersecurity` (proposed only; confirm routing and canonical URL structure in the repository).

## 9. Priority Article Queue

This queue is editorial priority, not a claim of verified monthly search volume.

| #   | Working article title                                               | Category            | Primary reader                      | Learning goal                                                         | Suggested slug                           |
| --- | ------------------------------------------------------------------- | ------------------- | ----------------------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| 1   | How to Secure a Node.js Application Before Production Deployment    | Deployment security | Node.js developers and self-hosters | Apply and explain a secure pre-deployment checklist                   | `secure-nodejs-production-deployment`    |
| 2   | What Is DevSecOps? A Beginner's Guide to Secure Software Deployment | Foundations         | Students and junior developers      | Explain where security belongs in a development lifecycle             | `what-is-devsecops`                      |
| 3   | How to Protect Environment Variables and API Keys in Production     | Secure development  | Developers                          | Manage and limit exposure of application secrets                      | `protect-environment-variables-api-keys` |
| 4   | AI-Powered Cyberattacks: What Developers Need to Know               | Current threats     | Developers and students             | Identify documented AI-related attack patterns and practical defenses | `ai-powered-cyberattacks`                |
| 5   | Software Supply Chain Attacks: The Hidden Risks in npm Packages     | Secure development  | JavaScript developers               | Evaluate package risk and apply dependency safeguards                 | `npm-supply-chain-security`              |
| 6   | GitHub Actions Security: How to Protect Your Deployment Pipeline    | Deployment security | Developers and maintainers          | Reduce CI/CD workflow, token, and permission risks                    | `github-actions-security`                |
| 7   | OWASP Top 10:2025 Explained for Modern Web Applications             | Foundations         | Web developers and IT students      | Recognize major web application risk categories and mitigations       | `owasp-top-10-2025`                      |
| 8   | Zero Trust Security Explained for Developers and Small Teams        | Future-focused      | Developers and small teams          | Explain Zero Trust principles and evaluate common use cases           | `zero-trust-security-developers`         |
| 9   | How to Secure Nginx and Node.js Applications on Ubuntu              | Deployment security | Linux self-hosters                  | Check reverse proxy, TLS, host permissions, and access exposure       | `secure-nginx-nodejs-ubuntu`             |
| 10  | AI Agent Security: The Risks of Automated Coding and Deployment     | Future-focused      | Developers using coding agents      | Evaluate agent privileges, approval boundaries, and secrets exposure  | `ai-agent-security-deployment`           |

**Evergreen expansion backlog, not yet scheduled:** HTTPS and TLS; authentication vs authorization; SQL injection; cross-site scripting; password hashing; database access controls; logging hygiene; backups and disaster recovery; machine identities; post-quantum cryptography; software bills of materials; infrastructure as code security; container security; secure by design.

## 10. First Article Brief: Article 01

**Working title:** How to Secure a Node.js Application Before Production Deployment  
**Proposed slug:** `secure-nodejs-production-deployment`  
**Category:** Cybersecurity / Deployment Security  
**Primary audience:** Beginner to intermediate Node.js and Express developers, students deploying their first app, and self-hosters  
**Skill level:** Beginner to intermediate  
**Intent:** Educational how-to, not a product sales article  
**Core question:** “What should I check before deploying my Node.js app to production, and why?”

### Why we are writing it

Readers often learn how to make a Node.js application work before they learn how to deploy it responsibly. This article should bridge that gap by explaining security checks in terms readers can understand, verify, and repeat.

### Measurable learning outcomes

After reading, a reader should be able to:

1. Identify common security risks when moving a Node.js application into production.
2. Explain why HTTPS, safe configuration, secret handling, and dependency maintenance matter.
3. Perform a basic security checklist against their own deployment setup.
4. Identify when a checklist is insufficient and deeper security review is needed.

### Recommended outline

1. What changes when an app goes into production?
2. Identify assets, public entry points, and potential risks.
3. Keep Node.js and dependencies updated; audit carefully.
4. Keep credentials out of source control and restrict secret access.
5. Use HTTPS and configure a trustworthy reverse proxy correctly.
6. Validate input and use safe authentication, sessions, and cookies.
7. Configure security headers, CORS, and request limits where appropriate.
8. Apply least privilege to database credentials, processes, and file permissions.
9. Protect deployment permissions and CI/CD credentials.
10. Log useful events without leaking secrets; plan backup and recovery.
11. Run a pre-deployment checklist with verification steps.
12. Explain what the checklist does not cover.
13. Knowledge check, takeaways, and authoritative sources.

### Required learning features

- One simple example of a risky configuration and a safer approach.
- One checklist with _what to check_, _why it matters_, and _how to verify_.
- One section distinguishing development convenience from production safety.
- At least three short comprehension checks.
- Current, verified links to applicable official documentation.

### Scope restrictions

- Do not claim a setup is “unhackable” or fully secure.
- Do not assume HelloDeploy implements a control without confirming it in the current codebase/documentation.
- Do not turn the tutorial into a product advertisement.
- Do not introduce unrelated application or infrastructure changes while adding the article.

## 11. Website Implementation Instructions

Before modifying HelloDeploy:

1. Inspect the existing repository and identify the article or blog content model, route conventions, templates, frontmatter fields, metadata, and deployment process.
2. Reuse the current layout and design system where possible. Keep the article readable on mobile and desktop.
3. Preserve existing article URLs, site behavior, and SEO settings.
4. If there is no article system, propose the **smallest maintainable approach** for one draft article; do not silently build a large CMS.
5. Ensure draft content is not accidentally published, indexed, or linked as live content.
6. Add only confirmed valid internal links; avoid broken links.
7. Verify headings, code block rendering, accessible tables, source links, metadata, and responsiveness.
8. Use the repository's existing test/build/lint commands. Report any checks that cannot be run.
9. Do not merge, push, deploy, or publish without explicit authorization for those actions.

## 12. Definition of Done for One Article

The article is **ready for editorial approval** only when all items are satisfied:

- [ ] The article answers a specific educational question.
- [ ] Primary and secondary audiences are defined.
- [ ] It lists 3–5 measurable learning outcomes.
- [ ] Definitions are correct and understandable to the intended skill level.
- [ ] Technical advice and factual assertions have been verified against reliable sources.
- [ ] Examples are safe, clear, and labeled appropriately.
- [ ] Readers have a practical checklist, scenario, exercise, or knowledge check.
- [ ] Misconceptions, assumptions, and limitations are explained.
- [ ] The draft is original and avoids exaggerated security claims.
- [ ] SEO title, slug, summary, headings, and internal links are accurate.
- [ ] Article rendering and accessibility have been checked.
- [ ] Available tests, link checks, and build validation pass or exceptions are recorded.
- [ ] The owner has reviewed the draft and approved the next action.

**Publishing is a separate approval decision.** Completing the article does not grant permission to automatically publish it or begin the next article.

## 13. Required Completion Report After Every Article

Provide a concise report with:

```markdown
## Article completion report

- Article number and title:
- Educational audience and learning objectives:
- Status: research / draft / implemented / approved / published
- Files added or modified:
- Sources verified:
- Tests and checks performed:
- Screenshots or preview path (if available):
- Known limitations or follow-up items:
- Publication status and authorization:
- Recommended next article:
- STOP: Await owner approval before proceeding.
```

## 14. Reusable Agent Instruction

> Follow `HELLODEPLOY_CYBERSECURITY_ARTICLE_IMPLEMENTATION_PLAN.md` as the editorial and implementation guide. Work on **Article 01 only**, or the next article explicitly approved by the owner. Start by examining the existing HelloDeploy content system and technical conventions. Research current authoritative cybersecurity sources, define measurable learning outcomes, draft an accessible educational article, validate technical examples, implement it using the smallest appropriate change, and run available checks. Keep the focus on reader learning rather than product promotion or keyword volume. Do not invent citations, technical behavior, or existing HelloDeploy features. Do not publish, deploy, or start the following article without explicit owner approval. End with the required article completion report.

---

**Guiding principle:** One article. One clear learning purpose. Verified explanations. Practical understanding. Review before moving on.
