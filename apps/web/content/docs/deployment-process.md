A deployment takes the code at one commit and turns it into a running website. This is what
happens between pressing publish and the site being live.

## The stages

1. **Prepare.** HelloDeploy clones the exact commit being deployed and assembles the build
   context, applying any include or ignore paths set on the project.
2. **Build.** Dependencies install with `npm ci`, then your build command runs. Both happen
   inside a single container build.
3. **Configure.** A port is allocated, networking is set up, and your environment variables
   are decrypted and prepared for the container.
4. **Start.** The container starts with your start command and your environment variables.
5. **Check.** HelloDeploy requests the health check path and waits for a successful response.
6. **Publish.** Web routing switches to the new release.

Traffic moves only at the final step. Until then your previous release is serving, which is
why a failed deployment does not take your site down.

## Deployment statuses

| Status      | Meaning                                                         |
| ----------- | --------------------------------------------------------------- |
| Queued      | Accepted, waiting for a worker                                  |
| Validating  | Configuration and repository access being checked               |
| Building    | Dependencies installing and the build running                   |
| Deploying   | Container starting, health check running, routing being updated |
| Healthy     | Running and serving traffic                                     |
| Failed      | Stopped at one of the stages above                              |
| Cancelled   | Stopped before it finished                                      |
| Rolled back | Replaced by an earlier release                                  |

In Simple mode a healthy release is labelled **Published** rather than "Live". Several
retained releases can be healthy at once while only one actually serves visitors, so
"published" describes the release and "live" is reserved for the one receiving traffic.

## What starts a deployment

- **Manually**, by publishing from the dashboard.
- **Automatically**, when you push to the project's production branch, if automatic
  publishing is enabled.
- **A deploy hook**, when something sends a request to your project's private hook URL.

## Where it can fail

| Stage   | Typical cause                                                              |
| ------- | -------------------------------------------------------------------------- |
| Prepare | Repository access, or a commit that no longer exists                       |
| Build   | A missing lockfile, a failing build command, a missing build-time variable |
| Start   | A start command that exits immediately                                     |
| Check   | Listening on the wrong port, or a health check path that returns an error  |

A failure at any stage leaves the previous release serving traffic.
