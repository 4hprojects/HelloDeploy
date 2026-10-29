# Article Verification Record

Evidence for the five launch tutorials, all dated 29 October 2026. Each was checked against
primary documentation (listed in the article's `references`) and, where commands are given,
run in a disposable Docker container. Anything not run is stated in the article's "Tested
environment" note or labelled as illustrative.

## How the commands were checked

Scripts and outputs are in [verification/](verification/). Each ran in a throwaway container
(`docker run --rm`, 768 MB memory and 1 CPU cap, no host ports, no volumes except read-only
script mounts). A `docker ps -a` comparison before and after showed no leftover containers.
Images pulled: `node:26-bookworm-slim`, `ubuntu:26.04`.

| Script          | Image and versions                                                                                                    | Result                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `run-node.sh`   | Node.js 26.13.0, npm 11.20.0, Express 5.3.0, PM2 7.1.1, Nginx 1.22.1 (Debian), helmet 8.3.0, express-rate-limit 8.7.1 | 18 of 18 checks PASS ([output](verification/node-evidence.txt))   |
| `run-ubuntu.sh` | Ubuntu 26.04.1 LTS, cloudflared 2026.10.5                                                                             | 10 of 10 checks PASS ([output](verification/ubuntu-evidence.txt)) |

## Per article

| Article                                | Primary sources checked                                                                                                                                                                       | Commands run                                                                                                                                                                                                                     | Not tested (stated in the article)                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A1 How to Deploy a Node.js Application | Node.js release schedule (`schedule.json`: 26 LTS from 2026-10-28; 24 and 22 maintenance to 2028-04-30 and 2027-04-30), npm ci, Express production practices, gitignore, Twelve-Factor config | PORT binding, `/healthz`, SIGTERM shutdown, `npm ci --omit=dev`                                                                                                                                                                  | Real hosting providers                                                                                  |
| A2 Old Laptop with Ubuntu              | Ubuntu Server docs (OpenSSH, UFW, automatic updates), Cloudflare package repository, tunnel creation, configuration file, Linux service                                                       | `sshd -t` and `sshd -T` with the hardening drop-in, UFW `--dry-run` rules, `unattended-upgrades` config, Nginx install and `nginx -t`, cloudflared install from the documented repository, `ingress validate` and `ingress rule` | Real hardware, lid switch setting, router reservation, enabling UFW, Cloudflare login and a live tunnel |
| A3 Self-Hosting vs Cloud Hosting       | DigitalOcean Droplet pricing and Amazon Lightsail pricing pages (read 2026-10-29); Daily Tribune 13 Oct 2026 report of Meralco's ₱15.0615/kWh October rate; NIST SP 800-34                    | None (no commands)                                                                                                                                                                                                               | The 15 W figure is an assumption, labelled illustrative                                                 |
| A4 PM2 and Nginx Explained             | PM2 quick start, startup, ecosystem docs; Nginx proxy module (defaults, HTTP/1.1 default since 1.29.7); Express behind proxies; Certbot                                                       | `pm2 start/reload/logs --nostream/save`, Nginx site, `nginx -t`, proxied 200, stopped app gives 502 and the quoted `connect() failed (111: Connection refused)` log line                                                         | `pm2 startup` (no systemd in a container), Certbot and TLS                                              |
| A5 Secure a Node.js Application        | Express security best practices, Express behind proxies, OWASP Node.js cheat sheet, OWASP Top 10, Helmet, npm audit, Node.js security practices                                               | Helmet CSP and HSTS headers, `X-Powered-By` removed, sixth login attempt returns 429, `trust proxy` loopback honours a forwarded address from the local proxy, `npm audit --omit=dev`, `npm ci`                                  | Backups, restore, monitoring                                                                            |

## Editorial checks

- `npm run content:check` passes: required fields, no raw HTML, every `/blog/...` link resolves
  to a published article.
- All external reference URLs returned HTTP 200 on 2026-10-29 (`curl -L`).
- No benchmarks, screenshots of real infrastructure, testimonials, or invented test results.
- Author: Henson Sagorsor, with the bio the owner approved on 2026-10-29.
- Social images are original cards rendered by `scripts/render-learning-hub-social-images.js`.

## Re-check schedule

Version-sensitive facts (Node.js support dates, PM2 and Nginx defaults, cloudflared install
steps, cloud prices, electricity rates) should be re-checked by 30 April 2027, when Node.js 22
reaches end of life, and whenever a reader reports a problem.
