A start command is how a deployed application is run: the instruction that launches your
program and keeps it serving requests.

## What it means

A built project is a set of files. Something has to actually run it. For most Node projects
that is:

```text
npm start
```

which runs the `start` script in your `package.json`.

## It has to keep running

This is the part that surprises people. The start command must launch a process that stays
alive.

A command that runs and finishes — a build step, a database migration, a one-off script —
looks to a deployment platform like an application that started and immediately stopped. The
deployment fails, and the logs show a successful start followed by an exit, which reads
oddly until you know what you are looking at.

## It has to listen where it is told

A web application waits for requests on a port. In production, the platform usually chooses
that port and tells the application through an environment variable, rather than the
application picking one.

An application that ignores that and binds a port of its own choosing will run perfectly and
still be considered broken, because nothing is listening where the platform is looking.

The same applies to the network interface: a server bound to `localhost` inside a container
is unreachable from outside it, even though it is running.

## Some projects have no start command

A static site has nothing to start. So does a React or Vue single-page application, which is
built into files and served directly — the build is the whole job, and there is no process
and no port.

If you find yourself wanting a start command for a single-page application, what you are
probably after is a separate backend, deployed as its own project.

## Common mistakes

- **Using the development server.** It is built for convenience, not for serving the public.
- **Hardcoding a port.** Read the one you are given.
- **A command that exits.** Anything that finishes is not a server.
- **Assuming a build script also starts things.** Build and start are separate steps with
  separate commands.

## How HelloDeploy handles it

HelloDeploy proposes a start command from your project and lets you correct it, and sets a
`PORT` environment variable when your container starts. Read that value rather than
hardcoding one — an application listening elsewhere never answers the health check, and the
deployment is rolled back. See [Start Command](/docs/start-command).
