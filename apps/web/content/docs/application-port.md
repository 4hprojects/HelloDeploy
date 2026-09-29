A server running inside a container has to listen somewhere. The application port is where.

## Read the port from the environment

HelloDeploy injects a `PORT` environment variable when your container starts, set to the
application port configured on your project:

```js
const port = process.env.PORT || 3000;
app.listen(port);
```

Read it rather than hardcoding a number. An application bound to a different port never
answers the health check, so the deployment starts and then fails — this is the most common
reason a deployment goes up and never becomes healthy.

## PORT is managed by the platform

You cannot set `PORT` as one of your own environment variables. Simple mode refuses it;
Advanced mode allows it with a warning, because an application that genuinely needs a fixed
port is unusual rather than wrong.

The same applies to `NODE_ENV`, `HOST` and `HOSTNAME`. HelloDeploy sets all four.

## Bind to every interface

A server bound to `localhost` inside a container is unreachable from outside it. Most
frameworks do the right thing by default; if yours takes a host argument, do not pin it to
`127.0.0.1`.

## Projects with no port

Static sites, and React and Vue applications built to static files, have no application port.
They are served directly rather than proxied to a running process.

## What goes wrong

| Symptom                                        | Likely cause                                        |
| ---------------------------------------------- | --------------------------------------------------- |
| Deployment starts, then fails its health check | Listening on a different port than the one injected |
| Works locally, fails once deployed             | A hardcoded port that happened to match locally     |
| Nothing in the logs after startup              | Bound to `localhost` instead of all interfaces      |
