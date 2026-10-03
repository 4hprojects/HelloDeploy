#!/usr/bin/env bash
# Root-only, fixed-target wrapper invoked through the restricted release identity.
set -euo pipefail

release_sha=${1:-}
request_id=${2:-}
if [[ $EUID -ne 0 ]]; then
  echo "Platform upgrade wrapper must run as root." >&2
  exit 77
fi
if [[ ! "$release_sha" =~ ^[a-f0-9]{40}$ || ! "$request_id" =~ ^[a-f0-9]{24}$ || $# -ne 2 ]]; then
  echo "Invalid platform upgrade arguments." >&2
  exit 64
fi

logger --tag hellodeploy-release "request=$request_id candidate=$release_sha started"
set +e
/bin/bash /opt/hellodeploy/infrastructure/upgrade.sh --ref "$release_sha"
result=$?
set -e
logger --tag hellodeploy-release "request=$request_id candidate=$release_sha result=$result"
exit "$result"
