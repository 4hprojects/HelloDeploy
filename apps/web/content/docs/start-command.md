After a project is built, HelloDeploy needs to know how to run it.

## What a start command is

The command that starts your application and keeps it running — typically:

```text
npm start
```

which runs the `start` script from your `package.json`.

## Projects with no start command

Not every project has one. A static site, and a React or Vue single-page application, is
built to files and served as a static site. There is no process to start and no port to
listen on, so the start command is empty and stays empty.

If you find yourself wanting a start command for a single-page application, what you probably
want is to deploy the server separately as a Node or Express project.

## It must keep running

The command has to start a process that stays up. A command that runs and exits — a build
step, a migration, a one-off script — makes the container stop, and the deployment fails.

## It must listen on the injected port

HelloDeploy sets a `PORT` environment variable when your container starts. Your application
must listen on it. See [Application Port](/docs/application-port) for what that means in
practice.

## Development commands do not belong here

A command that starts a development server with file watching and hot reloading is the wrong
thing in production: slower, heavier, and often bound to the wrong interface. Use your
project's production start script.

## What HelloDeploy proposes

HelloDeploy reads your `package.json` and suggests a start command for the runtimes it
recognises — usually your `start` script. It also records how confident it is: a command your
project declares is strong evidence, one filled in from a framework's convention is weaker.
Anything it had to guess is flagged so you can check it before deploying.

## When the start command is wrong

The symptom is distinctive. The build succeeds, the container starts, and the deployment then
fails its health check — because either nothing is listening, or the process has already
exited.

| What the logs show                               | Likely cause                                   |
| ------------------------------------------------ | ---------------------------------------------- |
| Startup messages, then nothing                   | The command ran and finished                   |
| Application reports a port you did not configure | A hardcoded port                               |
| Repeating startup messages                       | The process is crashing and restarting         |
| No output after the build                        | The command is not producing a running process |

A failed start leaves your previous release serving traffic, so a wrong start command does
not take your site down — it just prevents the new version replacing it.

## Related

- [Application Port](/docs/application-port)
- [Deployment Logs](/docs/deployment-logs)
- [What Is a Start Command?](/learn/what-is-a-start-command)
