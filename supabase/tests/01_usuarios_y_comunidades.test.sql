-- =====================================================================
-- Tests de permisos · Paso 1 (usuarios, comunidades, membresías)
--
-- Cómo correrlos: ver supabase/tests/README.md
-- Cada bloque arma su escenario, actúa como un usuario y verifica.
-- Si una verificación falla, el script corta con "FALLÓ: ...".
-- Todo corre dentro de una transacción que al final se descarta.
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
begin;

-- ---------- Helpers de test ----------
create schema test;
grant usage on schema test to authenticated, anon;

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

grant execute on all functions in schema test to authenticated, anon;

-- ---------- Escenario ----------
-- Usuarios (el trigger crea sus perfiles):
--   admin     superadmin de la plataforma
--   chava     crea "Los Andes" → coordinador
--   tini      rover de Los Andes
--   ramiro    educador de Los Andes
--   bruno     pide entrar a Los Andes (pendiente)
--   lucas     coordinador de otra comunidad, "Aconcagua"
--   intruso   logueado, sin comunidad
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@ej.com',   '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-000000000001', 'chava@ej.com',   '{"full_name":"Santiago","picture":"https://ej.com/c.png"}'),
  ('00000000-0000-0000-0000-000000000002', 'tini@ej.com',    '{"name":"Martina"}'),
  ('00000000-0000-0000-0000-000000000003', 'ramiro@ej.com',  '{"full_name":"Ramiro"}'),
  ('00000000-0000-0000-0000-000000000004', 'bruno@ej.com',   '{"full_name":"Bruno"}'),
  ('00000000-0000-0000-0000-000000000005', 'lucas@ej.com',   '{"full_name":"Lucas"}'),
  ('00000000-0000-0000-0000-000000000009', 'intruso@ej.com', '{"full_name":"Intruso"}');
update public.profiles set is_superadmin = true where id = '00000000-0000-0000-0000-00000000000a';
update public.profile_contacts set phone = '351 555 0001' where user_id = '00000000-0000-0000-0000-000000000001';
update public.profile_contacts set phone = '351 555 0002' where user_id = '00000000-0000-0000-0000-000000000002';

select test.ok((select full_name from public.profiles where id = '00000000-0000-0000-0000-000000000002') = 'Martina',
  'al registrarse se crea el perfil con el nombre de Google');
select test.ok((select avatar_url from public.profiles where id = '00000000-0000-0000-0000-000000000001') = 'https://ej.com/c.png',
  'al registrarse se guarda la foto de Google');

set local role authenticated;

-- ===== Crear y aprobar comunidades =====
select test.as_user('00000000-0000-0000-0000-000000000001');
create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
insert into ids values ('andes', public.request_community('Comunidad Los Andes', 'Grupo Scout 1', 'Córdoba'));
select test.ok(public.my_role((select v from ids where k='andes')) = 'coordinador', 'quien pide la comunidad queda como coordinador');
select test.ok((select status from public.communities where id = (select v from ids where k='andes')) = 'pendiente', 'la comunidad nueva queda pendiente');
select test.throws($$select public.join_community('XXXX-XXXX')$$, 'un código inexistente no sirve', 'no es válido');

select test.as_user('00000000-0000-0000-0000-000000000005');
insert into ids values ('aconcagua', public.request_community('Comunidad Aconcagua', 'Grupo Scout 2', 'Mendoza'));

select test.as_user('00000000-0000-0000-0000-000000000001');
select test.throws(format('select public.review_community(%L, true)', (select v from ids where k='andes')),
  'un coordinador no puede aprobar su propia comunidad', 'administrador');

select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.ok(public.is_superadmin(), 'admin es superadmin');
select test.ok(test.n('select 1 from public.communities') = 2, 'el superadmin ve todas las comunidades');
select public.review_community((select v from ids where k='andes'), true);
select public.review_community((select v from ids where k='aconcagua'), true);
select test.ok((select status from public.communities where id = (select v from ids where k='andes')) = 'activa', 'el superadmin aprueba la comunidad');

-- ===== Código de invitación =====
select test.as_user('00000000-0000-0000-0000-000000000001');
create temp table codes (k text primary key, v text) on commit drop;
grant all on codes to authenticated;
insert into codes values ('andes', public.get_invite_code((select v from ids where k='andes')));
select test.ok((select v from codes where k='andes') ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$', 'el coordinador ve el código con formato XXXX-XXXX');
select test.throws($$select invite_code from public.communities$$, 'nadie puede leer la columna del código directo', 'permission denied');

-- ===== Unirse =====
select test.as_user('00000000-0000-0000-0000-000000000002');
select test.ok(public.join_community(lower((select v from codes where k='andes'))) = 'pendiente', 'tini se une con el código (en minúscula también)');
select test.ok(not public.is_member((select v from ids where k='andes')), 'pendiente todavía no es miembro');
select test.ok(test.n('select 1 from public.communities') = 0, 'pendiente no ve la comunidad');
select test.throws(format('select public.get_invite_code(%L)', (select v from ids where k='andes')),
  'un no-coordinador no ve el código', 'coordina');

select test.as_user('00000000-0000-0000-0000-000000000003');
select public.join_community((select v from codes where k='andes'));
select test.as_user('00000000-0000-0000-0000-000000000004');
select public.join_community((select v from codes where k='andes'));

-- ===== Aprobar solicitudes =====
select test.as_user('00000000-0000-0000-0000-000000000002');
select test.throws(format('select public.review_membership(%L, true)',
    (select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000003')),
  'un pendiente no puede aprobar a otros', 'coordina');

select test.as_user('00000000-0000-0000-0000-000000000001');
select test.ok(test.n($$select 1 from public.memberships where status = 'pendiente'$$) = 3, 'el coordinador ve las 3 solicitudes pendientes');
select test.ok(test.n($$select 1 from public.profiles where full_name = 'Bruno'$$) = 1, 'el coordinador ve el perfil de quien pide entrar');
select public.review_membership((select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000002'), true);
select public.review_membership((select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000003'), true);
select public.set_member_role((select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000003'), 'educador');
select test.throws(format('select public.review_membership(%L, true)',
    (select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000002')),
  'no se puede aprobar dos veces', 'ya fue revisada');

-- ===== Escritura directa bloqueada =====
select test.as_user('00000000-0000-0000-0000-000000000002');
select test.ok(public.my_role((select v from ids where k='andes')) = 'rover', 'tini ya es rover activa');
select test.throws(format($$insert into public.memberships (community_id, user_id, role, status) values (%L, %L, 'coordinador', 'activo')$$,
    (select v from ids where k='aconcagua'), '00000000-0000-0000-0000-000000000002'),
  'nadie puede insertarse una membresía directo', 'permission denied');
select test.throws($$update public.memberships set role = 'coordinador'$$, 'nadie puede cambiarse el rol directo', 'permission denied');
select test.throws($$update public.profiles set is_superadmin = true where id = auth.uid()$$, 'nadie puede hacerse superadmin', 'permission denied');
select test.throws(format('select public.set_member_role(%L, %L)',
    (select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000002'), 'coordinador'),
  'un rover no puede cambiar roles', 'coordina');
-- RLS no tira error al editar algo ajeno: filtra las filas. Lo verificamos por el resultado.
update public.communities set name = 'Hackeada';
select test.ok(not exists (select 1 from public.communities where name = 'Hackeada'), 'un rover no puede editar los datos de la comunidad');

-- ===== Perfil propio =====
update public.profiles set nickname = 'Tini' where id = auth.uid();
select test.ok((select nickname from public.profiles where id = auth.uid()) = 'Tini', 'cada uno edita su apodo');
update public.profiles set nickname = 'Pirata' where id = '00000000-0000-0000-0000-000000000001';
select test.ok((select nickname from public.profiles where id = '00000000-0000-0000-0000-000000000001') is null, 'nadie edita el perfil de otro');

-- ===== Aislamiento entre comunidades =====
select test.ok(test.n('select 1 from public.communities') = 1, 'tini ve solo su comunidad');
select test.ok(test.n($$select 1 from public.profiles where full_name = 'Lucas'$$) = 0, 'tini no ve perfiles de otra comunidad');
select test.ok(test.n(format('select 1 from public.memberships where community_id = %L', (select v from ids where k='aconcagua'))) = 0,
  'tini no ve membresías de otra comunidad');

select test.as_user('00000000-0000-0000-0000-000000000005');
select test.ok(test.n('select 1 from public.communities') = 1, 'lucas ve solo Aconcagua');
select test.ok(test.n($$select 1 from public.profile_contacts where phone is not null$$) = 0, 'lucas no ve teléfonos de Los Andes');

select test.as_user('00000000-0000-0000-0000-000000000009');
select test.ok(test.n('select 1 from public.communities') = 0, 'un usuario sin comunidad no ve ninguna');
select test.ok(test.n('select 1 from public.profiles') = 1, 'un usuario sin comunidad solo se ve a sí mismo');
select test.ok(test.n('select 1 from public.memberships') = 0, 'un usuario sin comunidad no ve membresías');

-- ===== Teléfonos =====
select test.as_user('00000000-0000-0000-0000-000000000004'); -- bruno, pendiente
select test.ok(test.n($$select 1 from public.profile_contacts where phone is not null$$) = 0, 'un pendiente no ve teléfonos de la comunidad');
select test.as_user('00000000-0000-0000-0000-000000000003'); -- ramiro, educador activo
select test.ok(test.n($$select 1 from public.profile_contacts where phone is not null$$) = 2, 'un miembro activo ve los teléfonos de su comunidad');

-- ===== Educador =====
select test.ok(public.my_role((select v from ids where k='andes')) = 'educador', 'ramiro es educador');
select test.throws(format('select public.review_membership(%L, true)',
    (select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000004')),
  'un educador no aprueba solicitudes', 'coordina');

-- ===== Siempre un coordinador =====
select test.as_user('00000000-0000-0000-0000-000000000001');
select test.throws(format('select public.set_member_role(%L, %L)',
    (select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000001'), 'rover'),
  'el último coordinador no puede quitarse el rol', 'al menos un coordinador');
select test.throws(format('select public.leave_community(%L)', (select v from ids where k='andes')),
  'el último coordinador no puede irse sin nombrar a otro', 'al menos un coordinador');
select public.set_member_role((select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000002'), 'coordinador');
select public.set_member_role((select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000001'), 'rover');
select test.ok(public.my_role((select v from ids where k='andes')) = 'rover', 'con otro coordinador nombrado, chava puede dejar el rol');

-- ===== Regenerar código =====
select test.as_user('00000000-0000-0000-0000-000000000002'); -- tini, ahora coordinadora
select test.ok(public.regenerate_invite_code((select v from ids where k='andes')) <> (select v from codes where k='andes'), 'el coordinador genera un código nuevo');
select test.as_user('00000000-0000-0000-0000-000000000009');
select test.throws(format('select public.join_community(%L)', (select v from codes where k='andes')), 'el código viejo deja de servir', 'no es válido');

-- ===== Rechazo y reintento =====
select test.as_user('00000000-0000-0000-0000-000000000002');
select public.review_membership((select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000004'), false);
select test.as_user('00000000-0000-0000-0000-000000000004');
select test.ok(test.n('select 1 from public.communities') = 0, 'un rechazado no ve la comunidad');

-- ===== Baja y borrado de cuenta =====
select test.as_user('00000000-0000-0000-0000-000000000003'); -- ramiro
select public.delete_my_account();
select test.ok((select full_name from public.profiles where id = auth.uid()) = 'Ex miembro', 'borrar la cuenta anonimiza el nombre');
select test.ok(not public.is_member((select v from ids where k='andes')), 'borrar la cuenta da de baja de la comunidad');
select test.as_user('00000000-0000-0000-0000-000000000002');
select test.ok(test.n($$select 1 from public.profiles where full_name = 'Ramiro'$$) = 0, 'nadie sigue viendo el nombre real de quien borró su cuenta');

select test.as_user('00000000-0000-0000-0000-000000000001'); -- chava (rover) se va
select public.leave_community((select v from ids where k='andes'));
select test.ok(test.n('select 1 from public.communities') = 0, 'quien se va deja de ver la comunidad');

-- ===== Anónimo =====
reset role;
set local role anon;
select test.throws($$select * from public.profiles$$, 'un visitante sin sesión no lee perfiles', 'permission denied');
select test.throws($$select public.join_community('ABCD-EFGH')$$, 'un visitante sin sesión no puede unirse', 'permission denied');

reset role;
\o
\echo '✔ Todos los tests del paso 1 pasaron.'
rollback;
