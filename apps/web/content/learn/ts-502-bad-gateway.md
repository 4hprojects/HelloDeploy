## Quick answer

A 502 means the proxy in front of your site is working and your application is not answering
it. The proxy is fine; something behind it has crashed, is listening on the wrong port, or
never started.

## What the error actually says

"Bad gateway" means the server acting as a gateway got an invalid response — or none — from
the thing it forwarded to.

That is genuinely useful information. It tells you the request reached the platform, DNS is
correct, and routing worked. The failure is in the last step.

## Symptoms

- A 502 page, sometimes with "nginx" on it.
- The site working intermittently, if the application restarts in a loop.
- A deployment that appeared to succeed.

## Common causes

- **The application crashed** after starting.
- **It is listening on the wrong port**, so nothing is at the address the proxy forwards to.
- **It is bound to `localhost`** inside its container and unreachable from outside.
- **It is restarting repeatedly**, so it is sometimes there and sometimes not.
- **It is too slow to respond**, though that more often gives a 504.

## How to check

1. Read the deployment logs. Did the application start, and is it still running?
2. Look for a crash — an error just before the logs stop.
3. Check the port it reports against the one configured.
4. Check whether the same startup messages repeat, which means a restart loop.
5. Check whether it was working and stopped, or never worked at all.

## How to fix

**Crashed.** Find the error and handle it. An unhandled exception ends the process.

**Wrong port.** Read `process.env.PORT` rather than hardcoding.

**Wrong interface.** Bind to all interfaces, not `127.0.0.1`.

**Restart loop.** See [the application keeps restarting](/learn/troubleshooting/application-keeps-restarting).

**Too slow.** Find out what it is waiting for at startup.

## If it was working before

Check whether a deployment ran recently. A failed deployment should leave the previous
release serving, so a 502 after one suggests the application itself is failing rather than
the deployment.

Rolling back to a recent healthy release restores service while you investigate.

## Related

- [What Is a Reverse Proxy?](/learn/what-is-a-reverse-proxy)
- [What Is Nginx?](/learn/what-is-nginx)
