#!/usr/bin/env bash
set -Eeuo pipefail

if [ "$#" -ne 1 ]; then
  printf 'Usage: bash deploy/test/update.sh ubuntu@SERVER_IP\n' >&2
  exit 2
fi
target="$1"
if [[ ! "$target" =~ ^[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+$ ]]; then
  printf 'Expected an SSH target in user@host format.\n' >&2
  exit 2
fi

root_dir="$(cd "$(dirname "$0")/../.." && pwd)"
task_dir="$(mktemp -d /tmp/hanbo-deploy.XXXXXX)"
socket="$task_dir/ssh"
release="$(date -u +%Y%m%dT%H%M%SZ)-$$"
trap 'rm -rf "$task_dir"' EXIT

ssh -M -S "$socket" -o ControlPersist=10m -o ServerAliveInterval=20 -fN "$target"
cd "$root_dir"
COPYFILE_DISABLE=1 tar -czf "$task_dir/source.tar.gz" \
  package.json pnpm-lock.yaml pnpm-workspace.yaml \
  apps/api/package.json apps/api/src apps/api/prisma \
  apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json \
  packages/domain/package.json packages/domain/src packages/domain/tsconfig.json deploy/test
scp -o ControlPath="$socket" "$task_dir/source.tar.gz" "$target:/opt/hanbo-test/releases/$release.tar.gz"
ssh -S "$socket" "$target" bash -s -- "$release" <<'REMOTE'
set -Eeuo pipefail
release="$1"
release_dir="/opt/hanbo-test/releases/$release"
mkdir "$release_dir"
tar -xzf "$release_dir.tar.gz" -C "$release_dir"
cd "$release_dir"
sudo docker compose --env-file /opt/hanbo-test/.env -f deploy/test/compose.yaml config --quiet
sudo docker compose --env-file /opt/hanbo-test/.env -f deploy/test/compose.yaml build api
sudo bash /opt/hanbo-test/current/deploy/test/backup.sh < /dev/null
sudo docker compose --env-file /opt/hanbo-test/.env -f deploy/test/compose.yaml run --rm -T --no-deps api ./node_modules/.bin/prisma migrate deploy < /dev/null
sudo docker compose --env-file /opt/hanbo-test/.env -f deploy/test/compose.yaml up -d --wait --wait-timeout 90 api
curl --fail --silent --show-error http://127.0.0.1:3000/health
ln -sfn "$release_dir" /opt/hanbo-test/current
printf '\n{"event":"test_api_updated","release":"%s"}\n' "$release"
REMOTE
ssh -S "$socket" -O exit "$target"
