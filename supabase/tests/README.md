# Tests de permisos

Prueban las políticas RLS y las RPCs actuando como cada tipo de usuario. Cada archivo corre dentro de una transacción que se descarta al final, así que no deja datos.

## Con un Postgres común (lo más rápido)

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres ./supabase/tests/run-local.sh
```

El script crea una base `fogon_test`, aplica `_shim_supabase_local.sql` (roles y `auth.uid()` como los de Supabase), corre las migraciones y después los tests. Si algo falla, corta con `FALLÓ: ...`.

## Contra Supabase local

```bash
supabase db reset
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/01_usuarios_y_comunidades.test.sql
```

(Sin el shim: Supabase ya trae los roles y el esquema `auth`.)
