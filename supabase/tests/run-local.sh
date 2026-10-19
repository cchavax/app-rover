#!/usr/bin/env bash
# Corre las migraciones y los tests de permisos contra un Postgres común (sin Supabase).
# Uso: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-fogon_test}"

psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/_shim_supabase_local.sql >/dev/null
for f in migrations/*.sql; do
  echo "→ migración $(basename "$f")"
  # -1: cada migración en una sola transacción, como el SQL Editor de Supabase.
  psql -q -1 -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null
done
for f in tests/[0-9]*.test.sql; do
  echo "→ tests $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" 2>&1 | sed 's/^psql:[^:]*:[0-9]*: //; s/^NOTICE:  /  /'
done
