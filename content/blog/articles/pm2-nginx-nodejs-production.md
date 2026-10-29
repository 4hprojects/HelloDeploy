---
id: lh-pm2-nginx
slug: pm2-nginx-nodejs-production
title: 'PM2 and Nginx Explained: Running Node.js Applications in Production'
description: What a process manager and a reverse proxy each do, how to set up PM2 and Nginx for a Node.js app, and how to fix the dreaded 502 Bad Gateway.
category: server-management
tags: [nodejs, pm2, nginx, reverse-proxy, linux]
authorId: henson-sagorsor
status: published
publishedAt: '2026-10-29'
difficulty: intermediate
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/pm2-nginx-nodejs-production.png
testedEnvironment:
  summary: >-
    PM2 start, reload, logs and save, the Nginx site configuration, nginx -t, proxying, and the
    502 failure were run in a disposable node:26-bookworm-slim Docker container with Node.js
    26.13.0, PM2 7.1.1, and the Debian Nginx package 1.22.1. pm2 startup and TLS were not run,
    because a container has no systemd and no public domain.
  verifiedAt: '2026-10-29'
references:
  - title: PM2 — Quick start
    url: https://pm2.keymetrics.io/docs/usage/quick-start/
  - title: PM2 — Startup script
    url: https://pm2.keymetrics.io/docs/usage/startup/
  - title: PM2 — Ecosystem file
    url: https://pm2.keymetrics.io/docs/usage/application-declaration/
  - title: Nginx — ngx_http_proxy_module
    url: https://nginx.org/en/docs/http/ngx_http_proxy_module.html
  - title: Nginx — Beginner's guide
    url: https://nginx.org/en/docs/beginners_guide.html
  - title: Express — Express behind proxies
    url: https://expressjs.com/en/guide/behind-proxies.html
  - title: Certbot instructions
    url: https://certbot.eff.org/instructions
---

On a server you manage yourself, two tools usually sit around a Node.js app. **PM2** keeps the Node.js process running. **Nginx** receives requests from the internet and passes them to that process. They solve different problems, and most production trouble comes from mixing up which one is responsible for what.

This guide sets both up for a single Express app on a Linux server, then covers logs, restarts, HTTPS, and the 502 error.

## Who does what

| Concern                                        | PM2 (process manager)   | Nginx (reverse proxy) |
| ---------------------------------------------- | ----------------------- | --------------------- |
| Starts the app and restarts it after a crash   | Yes                     | No                    |
| Starts the app again after a server reboot     | Yes, with `pm2 startup` | No                    |
| Collects the app's console output              | Yes                     | No                    |
| Listens on ports 80 and 443                    | No                      | Yes                   |
| Terminates HTTPS                               | No                      | Yes                   |
| Serves several apps or domains from one server | No                      | Yes                   |
| Returns 502 when the app is down               | —                       | Yes                   |

The Node.js app itself listens on a private port such as 3000 on `127.0.0.1`. Only Nginx is exposed.

## Prerequisites

- A Linux server with a non-root user that can use `sudo`
- Node.js from an LTS release line installed for that user
- An app that reads its port from `process.env.PORT` (see [How to Deploy a Node.js Application](/blog/how-to-deploy-nodejs-app))
- A domain name pointing at the server, for the HTTPS step

## Step 1: Run the app with PM2

Install PM2 globally:

```sh
npm install -g pm2
```

Describe the app in an ecosystem file, `ecosystem.config.cjs`, in the project directory. The `.cjs` extension keeps it a CommonJS file even if your project uses ES modules.

```js
module.exports = {
  apps: [
    {
      name: 'myapp',
      script: 'server.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
```

Start it and confirm it is online:

```sh
pm2 start ecosystem.config.cjs
pm2 ls
curl -fsS http://127.0.0.1:3000/healthz
```

Keep secrets out of this file if it is committed. Put them in the server's environment or a file outside the repository that only the app user can read.

## Step 2: Survive reboots

PM2 can install a system service that restores your apps at boot. Run the command **without** `sudo`:

```sh
pm2 startup
```

It prints a command that starts with `sudo env PATH=...`. Run exactly that printed command. It includes the path to your current Node.js binary. Then save the current process list:

```sh
pm2 save
```

`pm2 save` writes the list that is restored at boot. Run it again whenever you add or remove apps. After upgrading Node.js, the startup service may still point at the old binary; refresh it with `pm2 unstartup`, then `pm2 startup` again.

## Step 3: Deploy updates and read logs

After pulling a new release and running `npm ci --omit=dev`, reload the app:

```sh
pm2 reload myapp
```

`reload` restarts the app's processes; with more than one instance in cluster mode, PM2 replaces them one at a time so the app keeps answering. With a single instance there is a brief restart, so expect a moment of unavailability.

Read recent output without following the stream:

```sh
pm2 logs myapp --lines 50 --nostream
```

PM2 stores logs under `~/.pm2/logs/` and does not rotate them by default. On a long-running server, add rotation (for example the `pm2-logrotate` module) or the disk slowly fills.

## Step 4: Put Nginx in front

Install Nginx from your distribution (`sudo apt install nginx` on Ubuntu and Debian) and create `/etc/nginx/sites-available/myapp`:

```nginx
server {
    listen 80;
    server_name example.com www.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

What each line does:

- `proxy_pass` sends the request to the Node.js app on the loopback address.
- `proxy_http_version 1.1` is set explicitly because Nginx used HTTP/1.0 to upstreams by default before version 1.29.7, and distribution packages often ship older versions.
- `Host` is replaced by default with the upstream address; passing `$host` lets the app see the real domain.
- The `X-Forwarded-*` headers tell the app the visitor's address and whether the original request used HTTPS.

Enable the site, **test the configuration**, and only then reload:

```sh
sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/myapp
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` checks syntax and file references without touching the running server. If it fails, the running Nginx keeps the old configuration, so a typo cannot take the site down as long as you always test first.

## Step 5: Tell Express about the proxy

Behind Nginx, every request reaches Express from `127.0.0.1`. To see the visitor's real address in `req.ip` (for logging and rate limiting), trust only the proxy you actually have:

```js
app.set('trust proxy', 'loopback');
```

Do not use `app.set('trust proxy', true)` unless the last proxy overwrites the forwarding headers; otherwise a visitor can send a fake `X-Forwarded-For` and choose their own IP address.

## Step 6: Add HTTPS

With DNS pointing at the server, Certbot can obtain a free Let's Encrypt certificate and edit the Nginx site for you. Follow the Certbot instructions for your exact operating system and web server, because the recommended installation method differs between distributions. Afterwards, confirm renewal works:

```sh
sudo certbot renew --dry-run
```

If the server sits behind Cloudflare Tunnel or another proxy that terminates TLS, the certificate lives there instead; see [How to Host a Website on an Old Laptop Using Ubuntu](/blog/host-website-old-laptop-ubuntu).

## Troubleshooting 502 Bad Gateway

A 502 from Nginx means Nginx is working but could not get a valid response from the app. Check in this order:

1. **Is the app running?** `pm2 ls` — a status of `errored` or a climbing restart count means the app is crashing. Read `pm2 logs myapp --lines 100 --nostream`.
2. **Is it on the port Nginx expects?** `curl -i http://127.0.0.1:3000/healthz` on the server. If that fails, the app is not listening where `proxy_pass` points.
3. **What does Nginx say?** `sudo tail -n 20 /var/log/nginx/error.log`. When the app is down you will see `connect() failed (111: Connection refused) while connecting to upstream`.

| Error log message                                | Meaning                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `connect() failed (111: Connection refused)`     | Nothing is listening on that port                                                                   |
| `upstream timed out (110: Connection timed out)` | The app accepted the request but did not answer within `proxy_read_timeout` (60 seconds by default) |
| `no live upstreams`                              | Every configured upstream is marked failed                                                          |

## Common pitfalls

- Running the app as `root`. Use an ordinary user; only Nginx needs the privileged ports.
- Opening port 3000 in the firewall. Only 80 and 443 (and SSH) need to be reachable.
- Forgetting `pm2 save` after changes, so a reboot restores an old process list.
- Editing Nginx and reloading without `nginx -t`.

## Related guides

- [How to Deploy a Node.js Application: A Beginner's Step-by-Step Guide](/blog/how-to-deploy-nodejs-app)
- [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production)
