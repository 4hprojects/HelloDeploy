---
id: lh-owasp-top-10-2025
slug: owasp-top-10-2025
title: OWASP Top 10:2025 Explained for Modern Web Applications
description: A plain-language tour of the ten OWASP Top 10:2025 risk categories, what changed since 2021, and how each one shows up in a typical web app.
category: web-security
tags: [owasp, security, web-applications, access-control, beginners]
authorId: henson-sagorsor
status: published
publishedAt: '2026-11-20'
difficulty: beginner
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/owasp-top-10-2025.png
references:
  - title: OWASP Top 10:2025
    url: https://top10.owasp.org/2025
  - title: A01:2025 Broken Access Control
    url: https://top10.owasp.org/2025/A01_2025-Broken_Access_Control/
  - title: A02:2025 Security Misconfiguration
    url: https://top10.owasp.org/2025/A02_2025-Security_Misconfiguration/
  - title: A03:2025 Software Supply Chain Failures
    url: https://top10.owasp.org/2025/A03_2025-Software_Supply_Chain_Failures/
  - title: A04:2025 Cryptographic Failures
    url: https://top10.owasp.org/2025/A04_2025-Cryptographic_Failures/
  - title: A05:2025 Injection
    url: https://top10.owasp.org/2025/A05_2025-Injection/
  - title: A06:2025 Insecure Design
    url: https://top10.owasp.org/2025/A06_2025-Insecure_Design/
  - title: A07:2025 Authentication Failures
    url: https://top10.owasp.org/2025/A07_2025-Authentication_Failures/
  - title: A08:2025 Software or Data Integrity Failures
    url: https://top10.owasp.org/2025/A08_2025-Software_or_Data_Integrity_Failures/
  - title: A09:2025 Security Logging and Alerting Failures
    url: https://top10.owasp.org/2025/A09_2025-Security_Logging_and_Alerting_Failures/
  - title: A10:2025 Mishandling of Exceptional Conditions
    url: https://top10.owasp.org/2025/A10_2025-Mishandling_of_Exceptional_Conditions/
  - title: OWASP Application Security Verification Standard (ASVS)
    url: https://asvs.owasp.org/
---

The OWASP Top 10 is one of the best-known lists of web application security risks. It is published by OWASP, a non-profit application security community, and it is often the first security document a developer is asked to read. The 2025 edition is the eighth.

The list is short on purpose. Each entry is a **category** of related weaknesses, not a single bug, so it can be hard to see what a category means for the code you write. This guide takes each of the ten in turn, explains it in plain terms, and shows where it tends to appear in an ordinary web app.

## What you will learn

By the end of this guide you should be able to:

- **Recognize** the ten OWASP Top 10:2025 categories and explain each in one sentence.
- **Identify** a typical example of each category in a web application.
- **Describe** what changed between the 2021 and 2025 editions.
- **Explain** what the Top 10 is for, and why it is not a complete security checklist.

## Before you begin

You should have a rough idea of how a web application works: a browser sends requests, a server checks who you are, reads or writes a database, and sends back a response. The short code examples use Node.js and Express 5; they illustrate one pattern each and are not complete applications.

## What the Top 10 is, and is not

OWASP calls the Top 10 a standard **awareness document**. Its job is to point developers at the most important categories of risk, not to define everything an application must do.

The 2025 list is "data-informed, but not blindly data-driven". According to OWASP, contributors supplied testing data covering over 2.8 million applications, which was used to rank twelve candidate categories. Eight of the final ten come from that data; two, Software Supply Chain Failures and Security Logging and Alerting Failures, were promoted by a community survey of practitioners. One likely reason is that such problems are hard to measure with automated testing.

For a full set of requirements to build or test against, OWASP's category pages point to the Application Security Verification Standard (ASVS).

## What changed since 2021

OWASP describes the 2025 edition as having two new categories and one consolidation. Its introduction labels A10 as new and describes A03 as an expansion of an older category; SSRF is the consolidation.

- **A03 Software Supply Chain Failures** expands 2021's "Vulnerable and Outdated Components" into a broader category: breakdowns or compromises in building, distributing, or updating software, not only known-vulnerable libraries.
- **A10 Mishandling of Exceptional Conditions** is new: what happens when errors, unexpected input, or resource exhaustion hit your code.
- **Server-Side Request Forgery (SSRF)**, a separate category in 2021, has been rolled into A01 Broken Access Control.
- **Security Misconfiguration** rose from fifth to second place.
- Several categories were renamed to sharpen their focus: "Identification and Authentication Failures" became **Authentication Failures**; logging "and Monitoring" became logging "and Alerting", emphasizing that logs nobody is alerted about do little good; and "Software and Data Integrity Failures" became Software **or** Data Integrity Failures.

## The ten categories

### A01:2025 Broken Access Control

**What it is:** users can do or see things outside their permissions. OWASP reports that every application in its testing data had some form of this weakness.

**Where it shows up:** an invoice page at `/invoices/1042` that returns any invoice whose ID you type, as long as you are logged in. The app checked _who you are_ but not _whether this invoice is yours_.

```js
// Risky: any signed-in user can read any invoice
app.get('/invoices/:id', requireLogin, async (req, res) => {
  res.json(await Invoice.findById(req.params.id));
});

// Safer: the query is scoped to the signed-in user
app.get('/invoices/:id', requireLogin, async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!invoice) return res.sendStatus(404);
  res.json(invoice);
});
```

**Prevention:** OWASP's first rule is "except for public resources, deny by default". Check ownership on the server for every request, not just in the user interface, and log access control failures. SSRF, where an attacker makes your server fetch a URL of their choosing, often an internal one, now lives here too: validate and restrict the destinations your server will request.

### A02:2025 Security Misconfiguration

**What it is:** a system, application, or cloud service set up insecurely.

**Where it shows up:** default admin accounts left enabled, directory listings switched on, detailed error pages in production, a storage bucket readable by anyone, missing security headers, or sample apps left on the server.

**Prevention:** OWASP recommends a minimal platform, without unnecessary features, components, or samples, plus security headers and an automated process to verify configuration in every environment. In practice, build each environment from the same repeatable configuration, and check it with a script rather than by memory. [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production) covers headers and production settings for Express.

### A03:2025 Software Supply Chain Failures

**What it is:** breakdowns or compromises in how your software is built, distributed, or updated, often through third-party code, tools, or dependencies.

**Where it shows up:** an unmaintained library with known vulnerabilities, a compromised npm release that runs malicious code during installation, or a CI pipeline that pulls an action whose tag was moved to malicious code.

**Prevention:** know what you depend on (OWASP recommends a centrally managed software bill of materials, or SBOM), prefer signed packages, update deliberately, and roll updates out in stages rather than everywhere at once. [Software Supply Chain Attacks: The Hidden Risks in npm Packages](/blog/npm-supply-chain-security) and [GitHub Actions Security](/blog/github-actions-security) go into detail.

### A04:2025 Cryptographic Failures

**What it is:** missing, weak, or misused cryptography that exposes sensitive data.

**Where it shows up:** passwords stored with a fast hash such as MD5 or SHA-1, or in plain text; data sent over plain HTTP; an encryption key hard-coded in the source; an outdated TLS version.

**Prevention:** OWASP recommends storing passwords with strong, adaptive, salted hashing functions that have a work factor, such as bcrypt, scrypt, or Argon2. Encrypt data in transit with TLS 1.2 or later. Keep keys out of code. And the cheapest protection of all: do not store sensitive data you do not need, and discard it as soon as possible.

### A05:2025 Injection

**What it is:** untrusted input is sent to an interpreter, such as a database, shell, or browser, and executed as part of a command or query. Cross-site scripting (XSS) is included here.

**Where it shows up:** building a SQL query by joining strings.

```js
// Risky: the input becomes part of the SQL itself
const unsafe = await db.query(`SELECT * FROM users WHERE email = '${req.query.email}'`);

// Safer: a parameterized query sends the input separately as data
const safe = await db.query('SELECT * FROM users WHERE email = $1', [req.query.email]);
```

**Prevention:** OWASP's preferred option is a safe API that avoids the interpreter or keeps data separate from commands: parameterized queries, ORMs used correctly, and template engines that escape output by default. Server-side input validation helps, but OWASP notes that it is not a complete defense on its own.

### A06:2025 Insecure Design

**What it is:** a missing or ineffective security control in the design itself, as opposed to a mistake in implementing a good design. Perfect code cannot fix a flawed design.

**Where it shows up:** a password reset flow with no rate limit or expiry, a checkout that trusts a price sent by the browser, or a multi-tenant app where one customer's data is separated from another's only by a filter someone might forget.

**Prevention:** OWASP recommends threat modeling for critical flows such as authentication, access control, and business logic, and a secure development lifecycle. [What Is DevSecOps?](/blog/what-is-devsecops) introduces a four-question threat model you can use in a ten-minute design review.

### A07:2025 Authentication Failures

**What it is:** the system can be tricked into treating an attacker as a legitimate user.

**Where it shows up:** no limit on login attempts, default or hard-coded credentials, session IDs that are not replaced after login, or no multi-factor authentication on accounts that matter.

**Prevention:** use multi-factor authentication where possible, never ship default credentials, especially for admin users, and limit or increasingly delay failed login attempts, while being careful not to let attackers lock real users out. Use your framework's tested session and password handling instead of writing your own.

### A08:2025 Software or Data Integrity Failures

**What it is:** code or data is trusted without checking that it is what it claims to be and came from where it should.

**Where it shows up:** an app that downloads and runs plugins or updates without verifying a signature, a script loaded from a third-party CDN with no integrity check, or deserializing objects from untrusted input in a way that can run code.

**Prevention:** verify signatures or checksums for software and data from outside sources, review code and configuration changes, and keep your CI/CD pipeline segregated and access-controlled, because the pipeline decides what gets deployed.

### A09:2025 Security Logging and Alerting Failures

**What it is:** attacks cannot be detected or responded to because they are not logged, or because nobody is alerted.

**Where it shows up:** failed logins not recorded, logs kept only on the same server an attacker could compromise, logs full of passwords or tokens, or alerts that nobody reads.

**Prevention:** OWASP recommends logging every security control, whether it succeeds or fails, keeping audit trails that cannot be quietly altered, and raising an alert when users or the application behave suspiciously. Never log secrets or full request bodies.

### A10:2025 Mishandling of Exceptional Conditions

**What it is:** the application fails to prevent, detect, or respond to unusual situations, leading to crashes, unexpected behavior, or vulnerabilities. This is the newest category.

**Where it shows up:** an error page that prints a stack trace and database details, a payment that is half-recorded when a step fails, or an access check that **fails open**, granting access when something goes wrong:

```js
// Risky: if the permission lookup throws, access is granted
async function canEdit(user, doc) {
  try {
    return await permissions.check(user, doc);
  } catch {
    return true;
  }
}

// Safer: an error denies access, and the failure is recorded
async function canEdit(user, doc) {
  try {
    return await permissions.check(user, doc);
  } catch (error) {
    logger.error({ err: error, userId: user.id }, 'permission check failed');
    return false;
  }
}
```

**Prevention:** fail closed, roll back partially completed transactions, show users a generic error while logging details on the server, add a global exception handler for anything missed, and apply rate limits and resource quotas so unusual load does not take the application down.

## How to use the Top 10

- **As a learning map.** If a category is unfamiliar, start there. The [Node.js security checklist](/blog/secure-nodejs-before-production) covers practical steps for several categories at once.
- **In code review.** Ask the A01 question on every new route: "who is allowed to do this, and where is that checked?"
- **In threat modeling.** Run a new feature against the list and note which categories apply.
- **Not as a compliance checklist.** "We covered the Top 10" does not mean an application is secure. For detailed, testable requirements, use OWASP ASVS.

## Common mistakes and misconceptions

- **"The Top 10 is everything we need to check."** It is an awareness document covering the most important categories, not every risk.
- **"Number one is the only one that matters."** The ranking reflects how common and impactful issues are across many applications, not the risk to yours. A single injection flaw can be worse than ten minor misconfigurations.
- **"Our scanner covers the Top 10."** Scanners find some categories well, such as injection patterns and vulnerable dependencies, and others poorly, especially Broken Access Control and Insecure Design, which depend on what your application is supposed to allow.
- **"Logging is an operations problem."** Deciding which security events to log is an application design decision.

## Check your understanding

Try to answer each question before reading the answers below.

1. A signed-in user changes `/orders/17` to `/orders/18` in the address bar and sees another customer's order. Which category is this?
2. Which two 2025 categories were promoted by the community survey rather than the testing data, and why might that be?
3. Your login handler catches a database error and lets the user in "so the site keeps working". Which new 2025 category does this fall under?
4. Where did Server-Side Request Forgery go in the 2025 list?

**Answers**

1. A01 Broken Access Control: the app checks that the user is signed in, but not that the order is theirs.
2. A03 Software Supply Chain Failures and A09 Security Logging and Alerting Failures. One likely reason: both are hard to measure with automated testing, so practitioners' experience fills the gap.
3. A10 Mishandling of Exceptional Conditions; it fails open. It also enables A07 Authentication Failures.
4. It was rolled into A01 Broken Access Control.

## Key takeaways

- The Top 10:2025 lists ten categories of risk, led by Broken Access Control and Security Misconfiguration.
- New in 2025: Software Supply Chain Failures (broadened from vulnerable components) and Mishandling of Exceptional Conditions; SSRF moved into Broken Access Control.
- Many of the most serious categories, such as access control and insecure design, are about what your app should allow, which scanners struggle to judge.
- Use the list for awareness and review, and OWASP ASVS for detailed requirements.

## Related guides

- [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production)
- [What Is DevSecOps? A Beginner's Guide to Secure Software Deployment](/blog/what-is-devsecops)
- [Software Supply Chain Attacks: The Hidden Risks in npm Packages](/blog/npm-supply-chain-security)
- [GitHub Actions Security: How to Protect Your Deployment Pipeline](/blog/github-actions-security)
