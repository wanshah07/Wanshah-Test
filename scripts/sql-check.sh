#!/usr/bin/env bash
# Runs supabase/001..004 on a throwaway local Postgres with a stand-in for
# Supabase's own schemas, then checks the row level security from the side of
# the owner, a teammate, a signed-in stranger and the public anon key.
# Needs Postgres 15+ binaries (initdb, pg_ctl, psql) on PATH or in PG_BIN.
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PG_BIN:$PATH"
tmp="$(mktemp -d)"
trap 'pg_ctl -D "$tmp/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
initdb -D "$tmp/db" -U postgres -A trust >/dev/null
pg_ctl -D "$tmp/db" -o "-k $tmp -c listen_addresses=''" -l "$tmp/log" start >/dev/null
run() { PGOPTIONS="-c client_min_messages=warning" psql -X -q -v ON_ERROR_STOP=1 -h "$tmp" -U postgres -d postgres "$@"; }
run -f supabase/test/stub.sql
run -c "insert into vault.secrets_store values ('slidecraft_dispatch_token', 'test-token'), ('slidecraft_dispatch_repo', 'wanshah07/Wanshah-Test')"
for f in supabase/0*.sql; do
  # pg_net is a Supabase extension; the stand-in provides net.http_post instead.
  sed 's/^create extension if not exists pg_net;$/-- (pg_net stubbed)/' "$f" | run -f -
  # Every file must be safe to run twice.
  sed 's/^create extension if not exists pg_net;$/-- (pg_net stubbed)/' "$f" | run -f -
done
out="$(PGOPTIONS= psql -X -q -v ON_ERROR_STOP=1 -h "$tmp" -U postgres -d postgres -f supabase/test/rls_check.sql 2>&1)" && ok=1 || ok=0
printf '%s\n' "$out" | sed -n 's/^psql:[^:]*:[0-9]*: NOTICE:  //p; s/^NOTICE:  //p; s/^psql:[^:]*:[0-9]*: ERROR:  /ERROR  /p'
[ "$ok" = 1 ] || { echo "SQL checks FAILED"; exit 1; }
echo "all SQL checks passed"
