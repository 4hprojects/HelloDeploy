---
id: lh-old-laptop-ubuntu
slug: host-website-old-laptop-ubuntu
title: How to Host a Website on an Old Laptop Using Ubuntu
description: Turn a spare laptop into a small Ubuntu web server, secure SSH and the firewall, and publish it safely with Cloudflare Tunnel instead of opening router ports.
category: self-hosting
tags: [ubuntu, self-hosting, cloudflare-tunnel, nginx, linux]
authorId: henson-sagorsor
status: published
publishedAt: '2026-10-29'
difficulty: intermediate
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/host-website-old-laptop-ubuntu.png
testedEnvironment:
  summary: >-
    The SSH hardening file (checked with sshd -t), UFW rules (as a dry run), Nginx installation,
    the cloudflared package installation from Cloudflare's repository, and the tunnel ingress file
    (checked with cloudflared tunnel ingress validate) were run in a disposable Ubuntu 26.04.1 LTS
    Docker container with cloudflared 2026.10.5. Not tested here: real laptop hardware, a home
    router, enabling the firewall, logging in to Cloudflare, or a live tunnel.
  verifiedAt: '2026-10-29'
references:
  - title: Ubuntu Server documentation
    url: https://documentation.ubuntu.com/server/
  - title: Ubuntu — OpenSSH server
    url: https://documentation.ubuntu.com/server/how-to/security/openssh-server/
  - title: Ubuntu — Firewall (UFW)
    url: https://documentation.ubuntu.com/server/how-to/security/firewalls/
  - title: Ubuntu — Automatic updates
    url: https://documentation.ubuntu.com/server/how-to/software/automatic-updates/
  - title: Cloudflare package repository for cloudflared
    url: https://pkg.cloudflare.com/index.html
  - title: Cloudflare — Create a locally-managed tunnel
    url: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/
  - title: Cloudflare — Tunnel configuration file
    url: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/
  - title: Cloudflare — Run cloudflared as a service on Linux
    url: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/linux/
---

An old laptop is a surprisingly good first server. It has a battery that rides out short power cuts, a built-in screen and keyboard for when the network breaks, and it costs nothing you have not already spent. It is also a computer in your home, on your home network, so the security steps matter more than the web server steps.

This guide installs Ubuntu Server, locks down remote access, serves a site with Nginx, and publishes it through Cloudflare Tunnel so you never open a port on your router.

## Is self-hosting right for this project?

A home server suits personal sites, portfolios, learning projects, and tools for a few people. It is a poor fit when downtime costs money or when you must meet uptime or data-protection obligations. Expect outages from power cuts, internet outages, ISP maintenance, and your own mistakes. For a fuller comparison, read [Self-Hosting vs Cloud Hosting](/blog/self-hosting-vs-cloud-hosting).

Check your internet service terms too. Some residential plans restrict running servers. A tunnel avoids inbound connections, but it does not change what your contract allows.

## Check the hardware

- **64-bit processor.** Ubuntu Server's PC images need a 64-bit (amd64) processor; very old 32-bit-only laptops cannot run current releases.
- **Memory.** A static site and Nginx need very little; a Node.js app plus a database is more comfortable with 4 GB or more.
- **Storage.** An SSD is much faster and more reliable than an old spinning disk. Check the drive's health before trusting it with anything.
- **Battery.** A swollen or very old battery is a fire risk. If the battery is damaged, remove it and accept that the laptop now behaves like a desktop during power cuts.
- **Heat.** Clean the vents and keep the laptop on a hard surface, not a bed or carpet.

Measure power use with a plug-in energy meter if you want real numbers; the cost estimate in the comparison article shows how to turn watts into a monthly bill.

## Step 1: Install Ubuntu Server

Download the current Ubuntu Server LTS image from ubuntu.com, write it to a USB drive, and install it. During installation:

- Create an ordinary user for yourself. You will use `sudo` for administration.
- Choose to install the OpenSSH server.
- Use the whole disk unless you know you need something else.

After the first boot, update everything:

```sh
sudo apt update
sudo apt upgrade
```

Turn on automatic security updates. On Ubuntu the `unattended-upgrades` package does this; it is installed on most server images, and you can enable it with:

```sh
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

### Keep the laptop awake with the lid closed

Laptops usually suspend when the lid closes. On a server you want them to keep running. In `/etc/systemd/logind.conf`, set:

```ini
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
```

Then apply it with `sudo systemctl restart systemd-logind` (this can end a local graphical session; on a server install there is none). This setting was not tested in a container for this guide; test it on your laptop by closing the lid and checking the machine still answers.

## Step 2: Give the laptop a stable local address

Your router hands out local addresses with DHCP and may give the laptop a different one after a reboot. The simplest fix is a **DHCP reservation** in the router's settings: tie the laptop's network card to one address. Router menus differ, so look for "DHCP reservation", "static lease", or "address reservation".

A wired Ethernet connection is more reliable than Wi-Fi for a server.

## Step 3: Secure SSH

Copy your SSH public key from your own computer to the laptop:

```sh
ssh-copy-id yourname@192.168.1.50
```

Replace the address with the laptop's. Log in with the key **before** disabling passwords. Then create `/etc/ssh/sshd_config.d/60-hardening.conf`:

```text
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
```

Check the configuration and restart the SSH service only if the check passes. Restarting it does not end sessions that are already open:

```sh
sudo sshd -t
sudo systemctl restart ssh
```

Keep your current SSH session open and log in from a second terminal to confirm it still works. If it does not, fix the file from the session you kept open.

## Step 4: Turn on the firewall

Allow SSH first, then block everything else that arrives uninvited:

```sh
sudo ufw allow OpenSSH
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
sudo ufw status verbose
```

Order matters: enabling the firewall before allowing SSH can lock you out of a remote session. With Cloudflare Tunnel, you do not need to open ports 80 or 443, because the tunnel makes an outbound connection.

## Step 5: Serve the site with Nginx

```sh
sudo apt install nginx
sudo nginx -t
```

Nginx serves its default page from `/var/www/html`. Put your site's files there, or follow [PM2 and Nginx Explained](/blog/pm2-nginx-nodejs-production) to run a Node.js app behind Nginx. Check it on the laptop itself:

```sh
curl -I http://localhost
```

## Step 6: Publish with Cloudflare Tunnel

A home connection usually has no fixed public address, and many providers block or share incoming ports. Cloudflare Tunnel avoids both problems: a small program, `cloudflared`, connects out from the laptop to Cloudflare, and Cloudflare sends your visitors through that connection. You need a Cloudflare account and a domain whose DNS is managed by Cloudflare.

Install `cloudflared` from Cloudflare's package repository:

```sh
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install cloudflared
```

Log in, create a tunnel, and point a hostname at it. The login opens a browser link; the other two commands use the name you choose:

```sh
cloudflared tunnel login
cloudflared tunnel create home-site
cloudflared tunnel route dns home-site www.example.com
```

`tunnel create` prints the tunnel's ID and writes a credentials file into `~/.cloudflared/`. Treat that file like a password. Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL-ID>
credentials-file: /home/yourname/.cloudflared/<TUNNEL-ID>.json
ingress:
  - hostname: www.example.com
    service: http://localhost:80
  - service: http_status:404
```

The last rule is required: it answers any hostname you did not list with a 404. Check the file, then run the tunnel as a system service so it starts at boot:

```sh
cloudflared tunnel ingress validate
sudo cloudflared --config /home/yourname/.cloudflared/config.yml service install
sudo systemctl start cloudflared
```

Cloudflare's documentation recommends passing `--config` when you run `service install` with `sudo`, because `sudo` changes the home directory the service would otherwise read. Cloudflare provides HTTPS to visitors at its edge.

## Step 7: Back up and plan for failure

- **Back up off the laptop.** Copy site files and any database dumps to another device or a cloud storage service on a schedule.
- **Write down how to rebuild.** Package list, configuration files, the tunnel name. A dead disk should cost you an evening, not the project.
- **Watch it from outside.** A free external uptime check on your public address tells you when the laptop, your internet, or the tunnel is down.
- **Restarts.** In the laptop's firmware settings, look for an option to power on after AC power returns. Not every laptop has one.

## Security and privacy notes

- Your server shares a network with your family's devices. Keep it updated, and do not run services you do not need.
- Do not publish your home IP address, router details, or tunnel credentials in screenshots or repositories.
- Anything you host is publicly reachable through the tunnel. Protect admin pages with authentication.

## Limitations

This setup has single points of failure everywhere: one disk, one power supply, one internet connection. It is a learning platform and a home for small personal projects, not a replacement for redundant hosting.

## Related guides

- [Self-Hosting vs Cloud Hosting: Costs, Benefits and Limitations](/blog/self-hosting-vs-cloud-hosting)
- [PM2 and Nginx Explained: Running Node.js Applications in Production](/blog/pm2-nginx-nodejs-production)
- [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production)
