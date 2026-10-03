#!/usr/bin/env bash
# Installs a no-shell, forced-command identity for GitHub Actions deployments.
set -euo pipefail

release_user=hellodeploy-release
public_key_file=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --public-key-file) public_key_file=${2:-}; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 64 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 77
fi
if [[ -z "$public_key_file" || -L "$public_key_file" || ! -f "$public_key_file" ]]; then
  echo "--public-key-file must name a regular, non-symlink public key file." >&2
  exit 64
fi
public_key=$(<"$public_key_file")
if [[ "$public_key" == *$'\n'* || ! "$public_key" =~ ^ssh-(ed25519|rsa)[[:space:]][A-Za-z0-9+/=]+([[:space:]].*)?$ ]]; then
  echo "The release public key is invalid." >&2
  exit 64
fi

id "$release_user" &>/dev/null || useradd --system --create-home --home-dir /var/lib/hellodeploy-release --shell /bin/sh "$release_user"
usermod --shell /bin/sh "$release_user"
passwd --lock "$release_user" >/dev/null
install -m 0755 -o root -g root infrastructure/release-command.sh /usr/local/sbin/hellodeploy-release-command
install -m 0755 -o root -g root infrastructure/run-platform-upgrade.sh /usr/local/sbin/hellodeploy-run-upgrade
printf '%s\n' "$release_user ALL=(root) NOPASSWD: /usr/local/sbin/hellodeploy-run-upgrade *" \
  > /etc/sudoers.d/hellodeploy-release
chmod 0440 /etc/sudoers.d/hellodeploy-release
visudo -cf /etc/sudoers.d/hellodeploy-release >/dev/null

ssh_dir=/var/lib/hellodeploy-release/.ssh
install -d -m 0700 -o "$release_user" -g "$release_user" "$ssh_dir"
printf 'restrict,command="/usr/local/sbin/hellodeploy-release-command" %s\n' "$public_key" \
  > "$ssh_dir/authorized_keys"
chown "$release_user:$release_user" "$ssh_dir/authorized_keys"
chmod 0600 "$ssh_dir/authorized_keys"

echo "Restricted HelloDeploy release identity installed."
