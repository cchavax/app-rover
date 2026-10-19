-- Tests · Sede de la comunidad
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
begin;
\ir _helpers.sql

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', '{"full_name":"Chava"}'),
  ('00000000-0000-0000-0000-000000000002', '{"full_name":"Felipe"}'),
  ('00000000-0000-0000-0000-000000000005', '{"full_name":"Lucas"}');
insert into public.communities (id, name, scout_group, city, status, created_by) values
  ('a0000000-0000-0000-0000-00000000000a', 'Baden Powell', 'GS 1', 'Córdoba', 'activa', '00000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-00000000000b', 'Aconcagua', 'GS 2', 'Mendoza', 'activa', '00000000-0000-0000-0000-000000000005');
insert into public.memberships (community_id, user_id, role, status) values
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'coordinador', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', 'rover', 'activo'),
  ('a0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', 'coordinador', 'activo');
set local role authenticated;

select test.as_user('00000000-0000-0000-0000-000000000001');
update public.communities set home_name = 'Sede Grupo Scout', home_lat = -31.42, home_lng = -64.19 where id = 'a0000000-0000-0000-0000-00000000000a';
select test.ok((select home_name from public.communities where id = 'a0000000-0000-0000-0000-00000000000a') = 'Sede Grupo Scout', 'el coordinador marca la sede');
select test.throws($$update public.communities set home_lng = null where id = 'a0000000-0000-0000-0000-00000000000a'$$,
  'no puede quedar latitud sin longitud', 'communities_home_pair');

select test.as_user('00000000-0000-0000-0000-000000000002');
select test.ok((select home_lat from public.communities) = -31.42, 'los rovers ven la sede');
update public.communities set home_name = 'Otra' where id = 'a0000000-0000-0000-0000-00000000000a';
select test.ok((select home_name from public.communities) = 'Sede Grupo Scout', 'un rover no cambia la sede');

select test.as_user('00000000-0000-0000-0000-000000000005');
update public.communities set home_name = 'Hackeada' where id = 'a0000000-0000-0000-0000-00000000000a';
select test.ok(test.n($$select 1 from public.communities where home_name = 'Sede Grupo Scout'$$) = 0, 'otra comunidad no ve la sede');

reset role;
select test.ok((select home_name from public.communities where id = 'a0000000-0000-0000-0000-00000000000a') = 'Sede Grupo Scout', 'otra comunidad tampoco la puede cambiar');
\o
\echo '✔ Todos los tests de la sede pasaron.'
rollback;
