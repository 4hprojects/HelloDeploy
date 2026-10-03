#!/usr/bin/env bash
# Forced SSH command for the unprivileged platform release identity.
set -euo pipefail

original_command=${SSH_ORIGINAL_COMMAND:-}
if [[ ! "$original_command" =~ ^deploy\ ([a-f0-9]{40})\ ([a-f0-9]{24})$ ]]; then
  echo "Invalid platform release command." >&2
  exit 64
fi
release_sha=${BASH_REMATCH[1]}
request_id=${BASH_REMATCH[2]}

exec sudo -n /usr/local/sbin/hellodeploy-run-upgrade "$release_sha" "$request_id"
