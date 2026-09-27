# Article Brief: What Is a Build Command?

## Search Intent

Informational.

## Working Title

```text
What Is a Build Command and Why Does Your App Need One?
```

## Suggested URL

```text
/learn/what-is-a-build-command
```

## Must Cover

- what a build command is
- why some apps need one
- examples of build output
- difference between source code and production output
- when no build is needed
- common build failures

## Example

`npm run build` is the verified example — it is what HelloDeploy proposes for the
frontend frameworks it recognises, and builds install dependencies with `npm ci`.

Do not show a pnpm or Yarn build example. HelloDeploy installs with npm, so a
project locking with either of those needs a `package-lock.json` committed before
it will build.

## Suggested Outline

### H1
What Is a Build Command?

### H2
What a Build Does

### H2
Which Applications Need a Build?

### H2
Build Command vs Start Command

### H2
Common Build Command Examples

### H2
Why Builds Fail

### H2
Build Commands in HelloDeploy

## Internal Links

- What Is a Start Command?
- What Are Deployment Logs?
- `/docs/build-configuration`
