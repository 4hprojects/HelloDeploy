When you press deploy, a sequence of steps runs. Knowing what they are makes a failure much
easier to read, because failures happen at a particular step rather than "during deployment".

## 1. The code is collected

A specific version of your project — one commit — is copied out of your repository. Not
"the latest", but an exact, identified version. That is what makes a deployment repeatable
and a rollback possible.

## 2. Dependencies are installed

Almost every project depends on libraries written by other people. Those are not usually
committed to the repository, so they are downloaded and installed on the server.

This step relies on a lockfile: a record of exactly which versions were used. Without one you
can get different versions than you tested with, which is how a project that worked yesterday
breaks today without anyone changing it.

## 3. The project is built

Many projects are written in a form convenient for people and not for browsers or servers:
TypeScript that needs compiling, components that need bundling, styles that need processing.

The build converts that into what actually runs. Not every project needs it — plain HTML and
CSS do not — but most frameworks do.

## 4. It is packaged

The built project and everything it needs is assembled into one unit that can be started the
same way anywhere. Packaging is what stops "works on my machine" being an argument: the
package carries its own environment.

## 5. It is started

The package is run. Your configuration — database URLs, API keys — is supplied at this point
rather than being baked in, which is why the same package can run in different environments.

The program has to keep running. Something that starts and immediately finishes has not
started successfully, however clean its exit.

## 6. It is checked

Started is not the same as working. A request is made to the application and a sensible
response is expected before it is considered healthy.

This check is what makes a failed deployment safe: if nothing answers, the new version is
never given any traffic, and whatever was running before carries on.

## 7. Traffic is switched

Only now do visitors reach the new version. Requests for your address are routed to it, the
old version is retired, and the deployment is finished.

## Why the order matters

Each step depends on the one before. Dependencies cannot install without the code; the build
needs the dependencies; starting needs the build; checking needs it started.

So when a deployment fails, the step it failed at tells you where to look — and the steps
after it never ran, which means their absence is not evidence of anything.

## How HelloDeploy handles it

HelloDeploy runs exactly these steps and shows you which one it is on. The logs separate
dependency installation, the build, startup and the health check, so a failure points at a
stage rather than leaving you to search the whole thing.
