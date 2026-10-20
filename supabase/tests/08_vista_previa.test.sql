-- Tests · Vista previa pública
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
begin;
\ir _helpers.sql

insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000001', '{"full_name":"Chava"}');
insert into public.communities (id, name, scout_group, city, status, created_by) values
  ('a0000000-0000-0000-0000-00000000000a', 'Baden Powell', 'GS 1', 'Córdoba', 'activa', '00000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-00000000000c', 'Pendiente', 'GS 3', 'Salta', 'pendiente', '00000000-0000-0000-0000-000000000001');
insert into public.activities (id, community_id, title, location, description, starts_at, ends_at, created_by, deleted_at) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Taller de mochila', 'Parque Sarmiento', 'Secreto interno', now(), now() + interval '1 hour', '00000000-0000-0000-0000-000000000001', null),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Borrada', null, null, now(), now() + interval '1 hour', '00000000-0000-0000-0000-000000000001', now()),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000c', 'De comunidad pendiente', null, null, now(), now() + interval '1 hour', '00000000-0000-0000-0000-000000000001', null);

set local role anon;
select test.ok((select title from public.activity_preview('b0000000-0000-0000-0000-000000000001')) = 'Taller de mochila', 'sin sesión se ve el título para la tarjeta');
select test.ok((select community from public.activity_preview('b0000000-0000-0000-0000-000000000001')) = 'Baden Powell', 'y el nombre de la comunidad');
select test.ok(test.n($$select 1 from public.activity_preview('b0000000-0000-0000-0000-000000000002')$$) = 0, 'una actividad borrada no tiene vista previa');
select test.ok(test.n($$select 1 from public.activity_preview('b0000000-0000-0000-0000-000000000003')$$) = 0, 'una comunidad sin aprobar no tiene vista previa');
select test.throws('select * from public.activities', 'sin sesión no se puede leer la tabla de actividades', 'permission denied');
reset role;
select test.ok((select pg_get_function_result('public.activity_preview(uuid)'::regprocedure)) not like '%description%', 'la vista previa no expone la descripción');
\o
\echo '✔ Todos los tests de vista previa pasaron.'
rollback;
