# Phase 3: PHP and Java

## Part A: PHP

Scope: basic PHP sites and Laravel web apps first. WordPress only as a controlled template after persistent storage/external SQL validation. PHP-FPM requires a supported Nginx or Apache serving topology. Do not expose FastCGI directly as public HTTP.

Tasks:

- Detect `composer.json` and Laravel signatures; allow approved PHP versions and extensions.
- Implement reproducible Composer install, deterministic document root and server config.
- Laravel: `public/` web root, config/env, APP_KEY validation, proper storage/cache permissions, asset build only where needed.
- Background queues, scheduler and persistent storage must have separately tracked features. Never imply a single web container provides these reliably.
- External MySQL/MariaDB only initially; do not colocate unaudited databases on the customer host.
- Unit, integration, auth/secret, routing, rollback and version incompatibility tests.

## Part B: Java

Scope: Spring Boot HTTP applications built with Maven or Gradle and an executable JAR; no generic application servers or EAR/WAR deployments initially.

Tasks:

- Detect `pom.xml` or Gradle wrapper and Spring Boot dependencies.
- Restrict approved JDK versions and use verified toolchains, reproducible dependency strategy and multi-stage build.
- Locate built executable artifact deterministically; never assume `app.jar` exists.
- Configure HTTP binding, port and health endpoint via policy. Use Actuator only if app includes it and access is configured appropriately.
- Limit JVM heap to safe percentage of memory limit; measure build CPU/memory on 8GB pilot host. Keep incompatible or too-large builds pending admin approval.
- Verify persistent storage and database assumptions without offering built-in database hosting.

## Acceptance

- Basic PHP, Laravel, Maven Spring Boot and Gradle Spring Boot fixtures deploy via platform.
- HTTP routing, logs, secrets, rollbacks, quota enforcement and version errors validated.
- WordPress or background workers are explicitly marked unsupported until their subfeatures pass dedicated gates.
- Phase report and feature flags updated before moving on.
