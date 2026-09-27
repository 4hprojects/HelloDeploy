# Phase 1: Supported Runtimes

URL:

```text
/supported-runtimes
```

## SEO Title

```text
HelloDeploy Supported Runtimes and Frameworks
```

## Meta Description

```text
See which runtimes and frameworks are currently supported, being tested, planned, or not yet supported by HelloDeploy.
```

## H1

```text
What Can You Deploy With HelloDeploy?
```

## Intro

HelloDeploy is being developed as a general web application deployment platform.

Runtime and framework support should only be listed as available after the deployment workflow has been tested and verified.

Do not assume that every language or framework is supported.

## Status Definitions

### Supported

Verified through a complete deployment workflow.

### Testing

The runtime or framework is being evaluated and may not be ready for general use.

### Planned

Support is intended but not yet available.

### Not Currently Supported

HelloDeploy does not currently provide a verified deployment workflow for this runtime.

## Initial Runtime Matrix

The platform's framework detection currently recognizes: static sites, Node.js, Express, React, Vue, and Next.js. Anything outside that list has no detection path today.

Mark a row **Supported** only once it has passed the checklist below. Until then it is Testing, whatever the detector recognizes.

| Runtime or Framework | Status | Note |
|---|---|---|
| Static HTML, CSS and JavaScript | Supported once checklist passes | Detected |
| Node.js | Supported once checklist passes | Detected |
| Express | Supported once checklist passes | Detected |
| React | Supported once checklist passes | Detected |
| Vue | Testing | Detected |
| Next.js | Testing | Detected |
| Vite | Testing | Builds as a static or Node project depending on configuration |
| Python | Planned | No detection |
| Flask | Planned | No detection |
| FastAPI | Planned | No detection |
| Django | Planned | No detection |
| PHP | Planned | No detection |
| Laravel | Planned | No detection |
| Java | Planned | No detection |
| Spring Boot | Planned | No detection |
| Docker | Planned | No detection |

Do not publish a row with a status like "verify" or "supported if verified". Resolve it to one of the four statuses first, or leave the row out.

## Supported Status Checklist

Do not mark a runtime Supported unless:

- dependency installation works
- build works when required
- application starts
- port handling works
- environment variables work
- routing works
- domain access works
- HTTPS works where expected
- redeployment works
- logs are available
- at least one complete test deployment exists
