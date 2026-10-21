# ADR: Restricted Compose and Resource Entitlements (P5)

Status: **Proposed — blocked at the P5 entry gate.** Recorded 2026-10-17.

## Why this is a design, not code

The P5 brief allows work to start only after three things are proven:

1. the P4 builder and runtime controls, on the isolated nonproduction host;
2. a multi-service lifecycle design (this document);
3. realistic free disk and memory headroom on the target host.

Items 1 and 3 need live evidence that does not exist yet. Building a multi-container
release system before the single-container owner-image controls are proven would stack
unverified risk. This ADR records the design so implementation can start as soon as the
gate opens.

## Decision summary

- HelloDeploy never runs `docker compose`. It parses a Compose file into a normalized,
  allowlisted **service graph** and starts each service through the existing container
  path, with the existing security profile.
- A deployment becomes a **release set**: every service in the graph is built or resolved
  to a digest, started, and health-checked as a candidate set; only a fully healthy set
  takes the route, and rollback restores the previous set as a unit.
- Persistent storage stays out of the first P5 release. Stateful dependencies (databases,
  queues) remain external services.

## Service graph contract

Parsed from `compose.yaml` or `docker-compose.yml` at the application root (Compose files
are already stripped from build contexts; the parser reads them before sanitizing, through
the same contained reader as owner Dockerfiles).

```text
ServiceGraph {
  schemaVersion: 1
  services: [               // 1..3 (configurable ceiling)
    {
      name:        /^[a-z][a-z0-9-]{0,30}$/
      source:      { build: { dockerfilePath } } | { image: digest-pinned reference }
      public:      boolean  // exactly one service is public
      port:        integer  // required for the public service
      healthPath:  string   // required for every service with a port
      environment: [names]  // values come from project secrets, never the file
      dependsOn:   [service names]   // acyclic
      resources:   { memoryMb, cpu }  // within the project entitlement
    }
  ]
}
```

### Allowlisted Compose keys

`services.<name>`: `build.context` (must equal the application root), `build.dockerfile`,
`image`, `ports` (only the container port of the public service; host ports are ignored),
`environment` (names only), `depends_on` (list or `condition: service_healthy`),
`healthcheck` (translated to a platform HTTP probe), and `deploy.resources.limits`.

### Rejected outright

`privileged`, `network_mode`, `pid`, `ipc`, `userns_mode`, `devices`, `cap_add`,
`security_opt`, `sysctls`, `ulimits` above platform limits, `volumes` of any kind, `tmpfs`
beyond the platform default, `extra_hosts`, `dns`, `links`, `external_links`, `secrets`,
`configs`, `extends`, `include`, `profiles`, `x-*` extensions, `build.args` with values,
`build.context` outside the application root, and any top-level `networks` or `volumes`.
Unknown keys are errors, not warnings.

## Runtime topology

- One platform-created bridge network per release set; services resolve each other by
  `name`. Only the public service gets a loopback host port and an Nginx route.
- Container names, labels, and the network name are platform-generated
  (`hellodeploy.project`, `hellodeploy.deployment`, `hellodeploy.service`).
- Every service runs with the current profile: `--cap-drop ALL`, `no-new-privileges`,
  memory, CPU, and PID limits, and the owner-image policy (non-root, no volumes, size,
  scan) for each image.

## Release-set lifecycle

1. **Resolve:** build each `build` service on the remote builder and lock each `image`
   service to a digest. The set is recorded on the deployment as
   `releaseSet: [{ service, imageRef, imageDigest }]`.
2. **Start candidates:** start services in dependency order on a fresh network.
3. **Health:** each service must pass its probe within the health window; restarts during
   the window count as a crash loop, as today.
4. **Cut over:** only when every service is healthy, move the Nginx route to the new public
   service, then retire the previous set.
5. **Fail:** if any service fails, stop the whole candidate set; the previous set keeps
   serving. Partial sets never take traffic.
6. **Roll back:** start the recorded previous set by digest, using the same lifecycle.
7. **Recover:** on worker restart, reconcile by set: a set is live only if every member is
   running and the route points at its public service.

Stateless rollback only. Because volumes are not supported, there is no data rollback to
promise; external databases are the owner's responsibility, and schema migrations stay an
owner action.

## Entitlements and quotas

- Store **plan entitlements** (what an owner may request) separately from **host capacity**
  (what the host can give) and **allocations** (what a release set uses).
- A release set's summed memory, CPU, and PID limits must fit the project entitlement;
  the worker refuses a set that does not fit current host headroom, with an explanation.
- Provisional presets from the brief (Starter 0.25 CPU / 256 MB, Basic 0.5 / 512 MB,
  Standard 1 / 1 GB) are not published until benchmarked; Standard and multi-service sets
  stay disabled on the 8 GB pilot host until measurements support them.
- Meter per service (CPU seconds, memory high-water mark, log volume) without promising
  reservations or uptime.

## Alternatives rejected

- **Running `docker compose up` with a filtered file:** the Compose CLI's surface changes
  across versions and resolves features (profiles, includes, extensions) that a filter can
  miss; the platform would also lose its own naming, labels, and lifecycle.
- **Kubernetes or Nomad:** correct for multi-node, but out of proportion for one host; the
  brief defers multi-node to its own ADR.
- **Volumes in the first P5 release:** needs backup, restore, eviction, and deletion
  contracts that do not exist yet.

## Entry criteria to start implementation

- [ ] P4 live acceptance: fixtures plus every fail-closed case passed on the isolated host.
- [ ] Measured headroom on the target host for three concurrent services per set.
- [ ] This ADR reviewed and accepted, including the rejected-keys list.
- [ ] A fixture plan: public API plus private Redis-compatible service (no volume), and
      adversarial Compose files for each rejected key.

## Decisions on the open questions (2026-10-22)

Decided by the assistant under the owner's delegation, choosing the conservative option that
fits the rest of this ADR. Each can be revisited during the entry-gate review.

1. **Public service: the one service that declares `ports`.** No marker key: `x-*` extensions
   are already rejected, and only the public service may use `ports`. A file in which more than
   one service publishes ports is rejected, with a message to remove `ports` from the private
   services.
2. **Service ceiling: three, configurable.** The entry gate's headroom measurement on the target
   host confirms it or lowers it before any set is enabled.
3. **Private services: no outbound access by default.** Private services join an internal-only
   Docker network (`internal: true`); only the public service also joins the routed network. An
   opt-in for egress, if needed later, is a project setting, not a Compose key.
