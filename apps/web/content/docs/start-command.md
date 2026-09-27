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
