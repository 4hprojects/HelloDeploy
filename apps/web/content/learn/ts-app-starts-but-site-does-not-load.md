## Quick answer

The build succeeded and the container started, but nothing answered when the platform
checked. Almost always this is the port: either the application is listening on a different
one than expected, or it is bound to localhost inside a container where localhost means only
itself.

## Symptoms

- The build completes successfully.
- Logs show the application starting, often printing its usual banner.
- The deployment then fails at the health check.
- The site does not load, or returns 502.

## Common causes

- **Listening on the wrong port.** The platform injects `PORT`; an application that hardcodes
  a different number never receives anything.
- **Bound to `127.0.0.1`.** Inside a container that means the container only. Nothing outside
  can connect.
- **The process exited immediately after starting.**
- **The health check path returns an error**, even though the application is fine.
- **Startup is too slow**, so the check happens before it is ready.

## How to check

1. Read the logs after the start line. Did the application report listening, and on what?
2. Compare that port with the application port configured on the project.
3. Check your code reads `process.env.PORT` rather than a fixed number.
4. Check the host it binds. If your framework takes one, it should not be `127.0.0.1`.
5. Check whether the logs simply stop — that suggests the process exited.
6. Load the health check path locally. If it errors there, it will error when checked.

## How to fix

**Wrong port.** Read the injected value:

```js
const port = process.env.PORT || 3000;
app.listen(port);
```

**Wrong interface.** Bind to all interfaces — `0.0.0.0` where a host is required. Most
frameworks do this by default.

**The process exits.** The start command must run something that stays running. A script that
completes is not a server.

**Health check path errors.** Point the health check at a path that returns success. If `/`
redirects or requires authentication, choose another.

**Slow startup.** Do less before listening. Connecting to every external service before
accepting connections makes startup as slow as the slowest one.

## Verify

Redeploy and watch the logs through the health check. A healthy deployment reports the check
succeeding and then switches traffic.

## Related

- [What Is an Application Port?](/learn/what-is-an-application-port)
- [Application Port](/docs/application-port)
