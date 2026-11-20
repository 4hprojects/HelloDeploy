---
id: lh-secure-nginx-node-ubuntu
slug: secure-nginx-nodejs-ubuntu
title: How to Secure Nginx and Node.js Applications on Ubuntu
description: Harden an Nginx reverse proxy and a Node.js service on Ubuntu with tested settings for TLS, headers, limits, rate limiting, and systemd sandboxing.
category: server-management
tags: [nginx, nodejs, ubuntu, systemd, tls]
authorId: henson-sagorsor
status: draft
publishedAt: '2026-11-20'
difficulty: intermediate
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/secure-nginx-nodejs-ubuntu.png
testedEnvironment:
  summary: >-
    The Nginx site, proxy headers, and Node.js listener were tested in a disposable ubuntu:26.04
    Docker container (Ubuntu 26.04.1 LTS, Nginx 1.28.3, Node.js 22.22.1 from the Ubuntu archive,
    OpenSSL 3.5.5) with a self-signed certificate. The systemd units were scored with
    systemd-analyze security in offline mode (systemd 259); they were not started, because the
    container does not run systemd. The timeouts, real certificates, firewall rules, IPv6 traffic,
    and a running systemd service were not tested.
  verifiedAt: '2026-11-21'
references:
  - title: Nginx — ngx_http_ssl_module (ssl_protocols, ssl_reject_handshake)
    url: https://nginx.org/en/docs/http/ngx_http_ssl_module.html
  - title: Nginx — ngx_http_core_module (server_tokens, client_max_body_size, location)
    url: https://nginx.org/en/docs/http/ngx_http_core_module.html
  - title: Nginx — ngx_http_v2_module (http2)
    url: https://nginx.org/en/docs/http/ngx_http_v2_module.html
  - title: Nginx — ngx_http_limit_req_module
    url: https://nginx.org/en/docs/http/ngx_http_limit_req_module.html
  - title: Nginx — ngx_http_headers_module (add_header)
    url: https://nginx.org/en/docs/http/ngx_http_headers_module.html
  - title: Nginx — ngx_http_proxy_module
    url: https://nginx.org/en/docs/http/ngx_http_proxy_module.html
  - title: Mozilla — SSL Configuration Generator
    url: https://ssl-config.mozilla.org/
  - title: systemd.exec — Execution environment configuration
    url: https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html
  - title: systemd-analyze — security verb
    url: https://www.freedesktop.org/software/systemd/man/latest/systemd-analyze.html
  - title: Express — Express behind proxies
    url: https://expressjs.com/en/guide/behind-proxies/
  - title: Ubuntu Server documentation
    url: https://documentation.ubuntu.com/server/
---

Getting a Node.js app online behind Nginx is the first half of the job. The second half is making sure the server only does what you intended: it answers for your domain and nothing else, speaks modern TLS, refuses oversized or abusive requests, passes the real client address to your app without letting visitors fake it, and runs your app with as little power over the machine as possible.

This guide takes a working setup and hardens it, one layer at a time. The complete configuration passed `nginx -t` in a disposable Ubuntu 26.04 container, and each control described as tested below was exercised there with a real request; the checks are listed so you can repeat them on your own server.

## What you will learn

By the end of this guide you should be able to:

- **Configure** Nginx to answer only for your domain, accept only TLS 1.2 and 1.3, and send security headers.
- **Apply** request size limits, timeouts, and rate limits on sensitive routes.
- **Explain** how forwarded client addresses work and configure them so visitors cannot spoof them.
- **Harden** a Node.js systemd service so a compromised app has limited access to the server.
- **Verify** each control with a command, rather than assuming it works.

## Before you begin

This guide assumes Nginx proxies directly to a Node.js app on the same Ubuntu server, and that Nginx itself receives traffic on ports 80 and 443. If you have not set that up, start with [PM2 and Nginx Explained](/blog/pm2-nginx-nodejs-production). Application-level settings such as Helmet and Express `trust proxy` are covered in [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production).

**If your traffic arrives through a tunnel or CDN** instead, such as the Cloudflare Tunnel setup in [How to Host a Website on an Old Laptop Using Ubuntu](/blog/host-website-old-laptop-ubuntu), the tunnel handles HTTPS and connects to Nginx locally. In that case skip the HTTP-to-HTTPS redirect and the TLS default server in Layer 2 (they would cause redirect loops or errors), and put the Layer 3 limits, headers, and locations in a plain `listen 80` server block for your host names, without the `ssl_*` and `http2` lines. Configure Nginx's real IP module for the tunnel before using Layer 4 and the rate limits, or every visitor will appear as `127.0.0.1`; `$scheme` will also read `http`, so take the original scheme from the tunnel's own headers.

Version notes:

- The configuration uses `http2 on;`, which needs **Nginx 1.25.1 or later**. Ubuntu 26.04 ships 1.28; Ubuntu 24.04 ships 1.24, so on 24.04 remove that line and add `http2` to both 443 `listen` lines instead, for example `listen 443 ssl http2;` and `listen [::]:443 ssl http2;`.
- `ssl_reject_handshake` needs Nginx 1.19.4 or later.

The examples use `example.com` and `www.example.com`; list every host name you serve. Test on a staging server or keep a second SSH session open while you work, so a mistake cannot lock you out, and run `sudo nginx -t` before every reload.

## Layer 1: Keep the app off the public network

Your Node.js app should listen only on the loopback address, so the only way to reach it is through Nginx:

```js
server.listen(3000, '127.0.0.1');
```

If you call `listen(3000)` without an address, Node.js listens on all interfaces, and anyone who can reach the server's port 3000 bypasses every protection Nginx adds. On the server, check what is listening:

```bash
sudo ss -tlnp
```

You want to see `127.0.0.1:3000` for the app, not `0.0.0.0:3000` or `*:3000`. In the test, the app appeared only on `127.0.0.1:3000`. A firewall that allows only SSH, HTTP, and HTTPS is a second layer, not a replacement.

## Layer 2: Answer only for your domain

Bots scan IP addresses constantly, sending requests with random or missing host names. Make Nginx's **default server**, the one that handles any host name it does not recognize, refuse them:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    ssl_reject_handshake on;
    return 444;
}
```

`return 444` is a special Nginx code that closes the connection without sending a response. `ssl_reject_handshake on` rejects TLS connections for unknown names, so Nginx never presents your certificate to a scanner that does not know your domain. In the test, a request for `other.example` got no HTTP response, and the TLS handshake for it was rejected. The `[::]` lines do the same for IPv6.

Ubuntu's own default site also claims `default_server`, so disable it, or `nginx -t` will report a duplicate default server:

```bash
sudo rm /etc/nginx/sites-enabled/default
```

Then redirect plain HTTP for your domain to HTTPS, keeping the path Let's Encrypt uses for HTTP certificate challenges:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

The `root` path must match the webroot you give Certbot. In the test, a file under the challenge path was served over HTTP while other paths redirected to HTTPS.

## Layer 3: Modern TLS, headers, and limits

Here is the hardened HTTPS server block. Each part is explained below.

```nginx
limit_req_zone $binary_remote_addr zone=perip:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name example.com www.example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    server_tokens off;
    client_max_body_size 1m;
    client_body_timeout 10s;
    client_header_timeout 10s;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options "nosniff" always;

    location ~ /\. {
        deny all;
    }

    location /login {
        limit_req zone=login burst=5 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        include /etc/nginx/snippets/proxy-headers.conf;
    }

    location / {
        limit_req zone=perip burst=20 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        include /etc/nginx/snippets/proxy-headers.conf;
    }
}
```

The certificate paths assume Certbot; the test used a self-signed certificate at a different path.

### TLS versions

TLS 1.0 and 1.1 are obsolete. Nginx's own default for `ssl_protocols` is already `TLSv1.2 TLSv1.3` (TLS 1.3 by default since Nginx 1.23.4), and Ubuntu 26.04's `/etc/nginx/nginx.conf` sets the same, so the explicit line mainly documents your intent. One subtlety from the Nginx documentation: when several server blocks share an address, the protocols in effect can come from the **default server**, so keep the setting consistent, ideally once at the `http` level as Ubuntu does.

In the test, `openssl s_client` completed handshakes with TLS 1.2 and 1.3, and a TLS 1.1 attempt, with the client explicitly allowing it, was refused with a `protocol version` alert. For cipher settings, use the Mozilla SSL Configuration Generator, which publishes maintained configurations for Nginx and other servers.

### Headers

- `server_tokens off` removes the Nginx version from the `Server` header and error pages. It hides nothing from a determined attacker, but it stops you advertising which patches you lack.
- `Strict-Transport-Security` (HSTS) tells browsers to use only HTTPS for this host for the given time, here two years. Browsers cache it, so add it only once HTTPS works reliably for the host, and consider starting with a short value such as `max-age=300` and raising it later. Add `includeSubDomains` only after checking every subdomain.
- `always` makes Nginx add the header to error responses too.

Two pitfalls:

- **Inheritance.** Nginx inherits `add_header` directives from the server block only into locations that define no `add_header` of their own. If you add, say, a `Cache-Control` header inside a location, repeat the security headers there too, for example by putting them in a snippet you include. Nginx 1.29.3 and later also offer `add_header_inherit merge` to change this behavior.
- **Duplicates with Helmet.** Helmet's default HSTS header is `max-age=31536000; includeSubDomains`. If Nginx sets HSTS, turn off Helmet's `strictTransportSecurity` option (or drop the Nginx line), so browsers do not receive two conflicting headers.

### Size limits and timeouts

`client_max_body_size 1m` rejects request bodies over 1 MB with `413`, before they reach Node.js; in the test, a 2 MB upload was refused. Raise it only on routes that accept uploads. The short body and header timeouts close connections that send data very slowly, which would otherwise tie up resources; these were not exercised in the test.

### Hidden files

`location ~ /\. { deny all; }` blocks any path containing a component that starts with a dot, such as `/.env` or `/.git/config`, in case such files ever end up in a directory Nginx serves. The test returned `403` for `/.env`. On this HTTPS server it also blocks every `/.well-known/` path, such as `security.txt`; if you publish files there, add a `location ^~ /.well-known/` block for them. The `^~` modifier matters: a plain prefix location would lose to the regular expression.

### Rate limiting

`limit_req_zone` defines limits per client address, tracked in shared memory. The `login` zone allows one request per second on `/login`, with `burst=5 nodelay` allowing a short burst; extra requests are refused with `429` instead of Nginx's default `503`. In the test, 30 rapid requests to `/login` produced 6 successes and 24 `429` responses. The general `perip` zone uses a looser 10 requests per second for the rest of the site.

Rate limiting at Nginx protects every app behind it and stops floods early. Keep an application-level limit too, keyed to the account being attacked rather than only the address, because attackers can spread attempts across many addresses. Behind a CDN or tunnel, see the note in "Before you begin".

## Layer 4: Pass the real client address safely

Behind a proxy, your app sees every request coming from `127.0.0.1`. Nginx passes the original client address in headers. The snippet used above:

```nginx
# /etc/nginx/snippets/proxy-headers.conf
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
```

`proxy_http_version 1.1` matters on Nginx versions before 1.29.7, including Ubuntu 26.04's 1.28, which otherwise talk HTTP/1.0 to your app; the [PM2 and Nginx guide](/blog/pm2-nginx-nodejs-production) explains why.

Setting `X-Forwarded-For` to `$remote_addr` **replaces** anything the client sent. In the test, a request with a forged `X-Forwarded-For: 203.0.113.66` reached the app showing only the real address.

Many guides, including our PM2 and Nginx guide, use `$proxy_add_x_forwarded_for` instead. That **appends** the real address to whatever the client sent, which is correct when other proxies sit in front of Nginx, but it means the header can contain values the visitor made up. It is safe only if your app uses the right-most address that is not a trusted proxy, which is the one your Nginx appended; Express does this when `trust proxy` is set narrowly, for example to `loopback`. Choose one approach deliberately; when Nginx is the first hop, replacing the header is the simpler one.

## Layer 5: Run the app with the least power

If an attacker finds a remote code execution flaw in your app or a dependency, the damage depends on what the app's process can do. A dedicated system user and systemd's sandboxing options limit that.

This section replaces PM2 with a plain systemd service. If the app currently runs under PM2, stop it first so the two do not compete for port 3000, for example with `pm2 delete myapp` and `pm2 unstartup systemd`. If you prefer to keep PM2, you can still apply the dedicated user, file ownership, and secrets file steps.

Create a user that cannot log in, and keep the code owned by root so the app cannot modify itself:

```bash
sudo useradd --system --home /srv/myapp --shell /usr/sbin/nologin myapp
sudo chown -R root:root /srv/myapp
sudo install -d -o myapp -g myapp /srv/myapp/uploads
```

Create the secrets file, owned by root and readable only by root:

```bash
sudo install -d -m 755 /etc/myapp
sudo install -m 600 /dev/null /etc/myapp/env
sudoedit /etc/myapp/env
```

systemd reads `EnvironmentFile=` before it drops privileges, so the app user does not need to read the file. [How to Protect Environment Variables and API Keys in Production](/blog/protect-environment-variables-api-keys) covers secrets in more depth.

Then create the service:

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Node.js app
After=network.target

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/srv/myapp
ExecStart=/usr/bin/node /srv/myapp/app.js
Environment=NODE_ENV=production
EnvironmentFile=/etc/myapp/env
Restart=on-failure

# Sandboxing
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
ReadWritePaths=/srv/myapp/uploads

[Install]
WantedBy=multi-user.target
```

And start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now myapp
sudo systemctl status myapp
```

What the main options do, per the systemd documentation:

- `NoNewPrivileges=yes`: the process and its children can never gain privileges, for example through setuid programs.
- `ProtectSystem=strict`: the whole file system is mounted read-only for the service, except paths you list in `ReadWritePaths=`.
- `ProtectHome=yes`: `/home`, `/root`, and `/run/user` are inaccessible.
- `PrivateTmp=yes`: the service gets its own empty `/tmp`, invisible to other processes.
- `CapabilityBoundingSet=` (empty): removes all Linux capabilities, the fine-grained pieces of root's power.
- `RestrictAddressFamilies=`: the process may only open the listed kinds of sockets.

systemd can score a unit's exposure for you:

```bash
systemd-analyze security myapp.service
```

In the test, run offline against the unit files, the hardened unit scored **4.3 ("OK")** and a minimal unit with only `ExecStart=` scored **9.4 ("UNSAFE")**, on a scale where lower is better. The score is a guide, not a grade to maximize: some options can break apps that need them, so add them one at a time, restart, and check the logs with `journalctl -u myapp`.

## Verify everything

Run these on the server. The `--resolve` options send the request to the local Nginx while using your real host name, which also lets you test before DNS points at the server; from another machine, drop them.

```bash
R="--resolve example.com:80:127.0.0.1 --resolve example.com:443:127.0.0.1"

# Only Nginx and SSH should be listening publicly; the app only on 127.0.0.1
sudo ss -tlnp

# HTTP redirects to HTTPS
curl -sI $R http://example.com/ | head -n 1

# No version in Server, HSTS present
curl -sI $R https://example.com/ | grep -iE '^(server|strict-transport-security):'

# Hidden files refused (expect 403), oversized body refused (expect 413)
curl -s $R -o /dev/null -w '%{http_code}\n' https://example.com/.env
head -c 2000000 /dev/zero | curl -s $R -o /dev/null -w '%{http_code}\n' --data-binary @- https://example.com/

# Unknown host names get no response (expect 000)
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: other.example' http://127.0.0.1/

# TLS 1.2 works; TLS 1.1 is refused with a protocol version alert
echo | openssl s_client -connect 127.0.0.1:443 -servername example.com -tls1_2 2>/dev/null | grep 'New, TLSv1.2'
echo | openssl s_client -connect 127.0.0.1:443 -servername example.com -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0' 2>&1 | grep -o 'alert protocol version'

# The login rate limit returns 429 under a burst
for i in $(seq 1 20); do curl -s $R -o /dev/null -w '%{http_code}\n' https://example.com/login; done | sort | uniq -c
```

If you use a self-signed certificate for testing, add `-k` to the HTTPS `curl` commands.

## Common mistakes and misconceptions

- **"The app is behind Nginx, so it's not exposed."** Not if it listens on all interfaces. Check with `ss`.
- **"`server_tokens off` makes the server secure."** It hides a version number. Patching is what matters.
- **Turning on a long HSTS period before HTTPS is reliable.** Browsers will refuse plain HTTP for the whole period you set.
- **Trusting `X-Forwarded-For` blindly.** Unless Nginx overwrites it or your app reads only the address its own proxy added, visitors can choose their own IP address, defeating rate limits and logs.
- **Running the app as root "just to get it working".** Any flaw then gives an attacker the whole server.

## Check your understanding

Try to answer each question before reading the answers below.

1. `ss -tlnp` shows your app on `0.0.0.0:3000`. What is the risk, and what is the fix?
2. Why does the default server use `ssl_reject_handshake on` instead of a certificate?
3. A visitor sends `X-Forwarded-For: 1.2.3.4`. With `proxy_set_header X-Forwarded-For $remote_addr;`, what does your app see?
4. Your app needs to write uploaded files. Which systemd option lets it, while `ProtectSystem=strict` keeps the rest of the file system read-only?

**Answers**

1. Anyone who can reach port 3000 bypasses Nginx, including its TLS, limits, and headers. Listen on `127.0.0.1`, and allow only the proxy's ports in the firewall.
2. It rejects TLS connections for unknown host names without presenting your certificate, so scanners probing the IP address learn nothing and get nothing.
3. Only the real client address; Nginx replaces the forged value.
4. `ReadWritePaths=/srv/myapp/uploads`.

## Key takeaways

- Bind the app to `127.0.0.1` and let only Nginx face the internet.
- Make the default server drop unknown host names, and serve only TLS 1.2 and 1.3.
- Set size limits, timeouts, and rate limits at Nginx, and keep an application-level limit too.
- Decide deliberately how forwarded addresses are handled so visitors cannot spoof them.
- Run the app as its own user with systemd sandboxing, and verify each control with a command.

## Related guides

- [PM2 and Nginx Explained: Running Node.js Applications in Production](/blog/pm2-nginx-nodejs-production)
- [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production)
- [How to Host a Website on an Old Laptop Using Ubuntu](/blog/host-website-old-laptop-ubuntu)
