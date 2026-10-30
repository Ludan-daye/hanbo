#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

backup_dir="/opt/hanbo-test/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 "$backup_dir"
cd /opt/hanbo-test/current
docker compose --env-file /opt/hanbo-test/.env -f deploy/test/compose.yaml exec -T postgres \
  pg_dump -U hanbo -d hanbo_test --format=custom --no-owner --no-acl < /dev/null > "$backup_dir/database.dump"
tar -czf "$backup_dir/uploads.tar.gz" -C /opt/hanbo-test/uploads .
cp /opt/hanbo-test/.env "$backup_dir/server.env"
readlink -f /opt/hanbo-test/current > "$backup_dir/release.txt"
cd "$backup_dir"
sha256sum database.dump uploads.tar.gz server.env > SHA256SUMS
printf '{"event":"backup_completed","path":"%s"}\n' "$backup_dir"
