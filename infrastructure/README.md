# HelloDeploy Infrastructure

## Cloudflare ingress

Production session cookies are intentionally `Secure`, `HttpOnly`, and
`SameSite=Strict`. When Cloudflare terminates TLS and connects to Nginx over HTTP,
Nginx must preserve Cloudflare's visitor-facing `X-Forwarded-Proto` value. Replacing
it with `$scheme` reports the origin connection as HTTP and prevents Express from
issuing the secure session cookie, causing every form submission to fail CSRF
validation.

The installer and upgrade script render `nginx/hellodeploy-platform.conf.template`
to `/etc/nginx/conf.d/hellodeploy-platform.conf`. The resulting origin must be
limited to trusted Cloudflare traffic because the application trusts the forwarded
protocol header. After changing the ingress, validate and reload it with:

```bash
sudo nginx -t
sudo systemctl reload nginx
```
