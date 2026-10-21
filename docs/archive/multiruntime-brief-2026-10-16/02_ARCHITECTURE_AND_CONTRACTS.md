# Target Architecture and Extensibility Contracts

## Core idea

Keep the current release orchestrator (clone exact commit -> build -> create constrained candidate -> health -> atomic route -> retain rollback) unchanged in principle. Add a typed, validated **build strategy** layer. All strategies must return an immutable OCI image digest plus normalized runtime metadata. The web tier never receives Docker access.

## Proposed execution flow

1. AuthZ: owner/maintainer requests action through `apps/web` with policy validation.
2. Persist verified project config, strategy and immutable source ref. Enqueue durable idempotent job.
3. Worker checks project lock and resource budget, clones exact commit or resolves trusted registry image digest.
4. Resolve strategy: `node_auto`, `next_auto`, `python_auto`, `php_auto`, `java_auto`, `dockerfile`, `oci_image`, `compose_restricted`.
5. Validate path/build context/version/port/secrets and apply user+plan allowlist.
6. Build via sandboxed builder or pull approved OCI digest. Collect SBOM/scan if enabled. Avoid credential leakage.
7. Create candidate under server-side controlled Docker security profile with allocated loopback port and isolated network.
8. Verify health/readiness and proxy behavior, atomically route, retain prior good deployment, implement rollback and cleanup.
9. Reconcile after interruption and record structured sanitized logs/audit events.

## Interface concept (adapt to actual conventions)

```
type BuildStrategy = {
  id: string;
  detect(repoSnapshot): DetectionResult;
  validate(input, plan, hostPolicy): ValidationResult;
  prepareBuild(context): BuildSpec;
  build(context): Promise<{ imageDigest: string; metadata: RuntimeMetadata }>;
};
```

Do not add dead abstractions or duplicate existing interfaces. Add contract versioning only if current schemas require it.

## Data contract goals

- `strategy`: approved strategy identifier; unknown identifiers rejected.
- `runtime`: framework, language, version; inferred value and user override tracked separately.
- `source`: Git commit SHA or registry digest, never mutable tag as deployed identity.
- `build`: context, Dockerfile relative path, approved args, architecture, resource/time ceilings.
- `run`: internal port, probe path, server-managed exposure, request limits, memory/CPU/disk/pids.
- `storage`: none by default; project-scoped named volume only after explicit policy.
- `services`: not enabled in V1; future Compose service graph, network, storage metadata.
- `security`: non-root process expectation, read-only filesystem where compatible, cap drop, no-new-privileges, seccomp/AppArmor, egress restrictions.
- `trace`: digest, release ID, build timings, test findings and redacted logs.

## Detection ordering

1. Explicit selected supported strategy and policy validation.
2. Dockerfile detection only suggests manual choice; do not silently execute untrusted Dockerfile.
3. Next.js / Node and supported language framework signatures with dependency checks.
4. Ask for app entry point or framework selection if ambiguous.
5. Never guess a valid port or health endpoint without user override and a verification failure path.

## API/UI

- Default beginner view: Connect repo -> Detect -> Confirm app -> Deploy.
- Advanced: strategy selector, build path, start/port/health, environment and resources.
- Display why a project was detected, what is unsupported, exact remediation, runtime/version and build limits.
- No raw Compose execution from user-supplied YAML, ever, without a restrictive parser and effective policy enforcement.

## Compatibility

Current Node/Static/Express/React/Vue/Next projects remain unchanged after migration. Old records default to legacy strategy when field absent. All new flags default off. No breaking routes or database migration without dedicated rollback and tests.
