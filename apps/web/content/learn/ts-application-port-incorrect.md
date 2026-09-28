## Quick answer

Your application is listening on a port nobody is asking about. HelloDeploy injects a `PORT`
environment variable set to the application port on your project; read it rather than
hardcoding a number.

## Symptoms

- The deployment starts and then fails its health check.
- Logs show the application running, often reporting a port like 3000 or 8080.
- Nothing responds, and the release is rolled back.

## Common causes

- A hardcoded port in the code.
- A port in the project configuration that differs from the one the application uses.
- An application reading a differently named variable, such as `APP_PORT`.
- A framework default that was never changed.

## How to check

1. Find the line in your logs where the application reports listening.
2. Compare that number with the application port configured on the project.
3. Search your code for `listen(` and check what it passes.
4. Confirm you are reading `process.env.PORT` and not another name.

## How to fix

Read the injected value, with a fallback for local development:

```js
const port = process.env.PORT || 3000;
app.listen(port);
```

If your framework reads a different variable name, map it:

```js
process.env.APP_PORT = process.env.PORT;
```

Do not try to set `PORT` yourself as a project environment variable — it is managed by the
platform. Simple mode refuses it; Advanced warns.

## Verify

Redeploy. The port your application reports in the logs should match the configured one, and
the health check should pass.

## Note

Getting the port right and still being unreachable usually means the wrong interface: an
application bound to `127.0.0.1` inside a container is unreachable from outside it. Bind to
all interfaces.

## Related

- [What Is an Application Port?](/learn/what-is-an-application-port)
