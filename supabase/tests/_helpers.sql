-- Helpers compartidos por los tests. Se incluyen con \ir dentro de la transacción de cada test.
create schema test;
grant usage on schema test to authenticated, anon, service_role;

create function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok  %', msg;
end $$;

-- Verifica que la sentencia tire error (y opcionalmente que el mensaje contenga un texto).
create function test.throws(q text, msg text, must_contain text default null) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if must_contain is not null and position(must_contain in sqlerrm) = 0 then
      raise exception 'FALLÓ: % (error inesperado: %)', msg, sqlerrm;
    end if;
    raise notice 'ok  % → "%"', msg, sqlerrm;
    return;
  end;
  raise exception 'FALLÓ: % (no tiró error)', msg;
end $$;

create function test.n(q text) returns bigint language plpgsql as $$
declare r bigint;
begin
  execute 'select count(*) from (' || q || ') t' into r;
  return r;
end $$;

-- Cambiar de usuario dentro de la transacción.
create function test.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

grant execute on all functions in schema test to authenticated, anon, service_role;

