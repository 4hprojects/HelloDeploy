Deployment is what turns code on your computer into a website other people can visit.

That sounds like it should mean copying files somewhere. Sometimes it does. More often it
means several other things too, which is why "just put it online" turns out to take an
afternoon.

## What it means

Your project works on your machine because your machine has everything it needs: the right
language installed, the libraries downloaded, a way to start the program, and a browser
pointed at the right address.

A server has none of that by default. Deployment is the work of giving it those things and
keeping them working while people use the site.

## What has to happen

For a simple site of HTML, CSS and image files, deployment really can be copying files to a
computer that serves them.

For an application — anything that runs code to decide what to send back — more is involved:

1. **Get the code onto the server**, at a known version rather than whatever happened to be
   there.
2. **Install its dependencies**, the libraries it relies on.
3. **Build it**, if it needs converting into a production form.
4. **Start it**, and keep it started when it crashes or the machine restarts.
5. **Give it its configuration**, such as database addresses and API keys, without writing
   them into the code.
6. **Route traffic to it**, so requests for your domain reach this program and not another.
7. **Serve it securely**, over HTTPS.

Miss any one and you get a site that half works, which is usually harder to diagnose than one
that does not work at all.

## Why it is more than uploading files

Uploading assumes the destination knows what to do with what arrives. A server given a folder
of application code does not know which file to run, what version of the language it needs,
which port to listen on, or what to do when the program exits.

Those decisions have to be made by someone. Deployment platforms exist to make most of them
for you, from conventions and from what they can detect about your project.

## Common mistakes

- **Assuming the server is like your machine.** It is not. Different versions, no development
  tools, and file paths that are case-sensitive even if yours is not.
- **Committing configuration.** Passwords and keys in a repository are exposed to everyone
  with access to it, and stay in its history after removal.
- **Deploying whatever is on disk.** Deploy a specific committed version, so you know what is
  running and can go back to it.
- **Assuming it is finished once it loads.** A process that runs now but exits on its first
  error is not deployed, it is running.

## How HelloDeploy handles it

HelloDeploy performs those steps for supported projects: it clones a specific commit,
installs dependencies, runs your build, starts your application with its configuration,
checks that it responds, and only then sends traffic to it.

The point is not that the steps disappear. It is that they happen the same way every time,
and you can see which one failed when something does.
