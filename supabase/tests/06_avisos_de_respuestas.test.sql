-- =====================================================================
-- Tests · Avisar a quien organiza cuando alguien responde
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
begin;
\ir _helpers.sql

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', '{"full_name":"Chava Chavarria"}'),
  ('00000000-0000-0000-0000-000000000002', '{"full_name":"Felipe Liprandi"}'),
  ('00000000-0000-0000-0000-000000000003', '{"full_name":"Milagros Grenon"}'),
  ('00000000-0000-0000-0000-000000000004', '{"full_name":"Joaquín Pérez"}');
update public.profiles set nickname = 'Mili' where id = '00000000-0000-0000-0000-000000000003';
insert into public.communities (id, name, scout_group, city, status, created_by) values
  ('a0000000-0000-0000-0000-00000000000a', 'Los Andes', 'GS 1', 'Córdoba', 'activa', '00000000-0000-0000-0000-000000000001');
insert into public.memberships (community_id, user_id, role, status) values
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'coordinador', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', 'rover', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000003', 'rover', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000004', 'rover', 'activo');
insert into public.activities (id, community_id, title, starts_at, ends_at, created_by) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Taller de mochila',
   now() + interval '5 days', now() + interval '5 days 3 hours', '00000000-0000-0000-0000-000000000002');

create function pg_temp.q() returns table (body text, n int, total bigint) language sql security definer as $$
  select (select body from public.notification_queue where kind::text = 'respuesta' order by id desc limit 1),
         (select group_count from public.notification_queue where kind::text = 'respuesta' order by id desc limit 1),
         (select count(*) from public.notification_queue where kind::text = 'respuesta')
$$;
create function pg_temp.mark_sent() returns void language sql security definer as $$
  update public.notification_queue set sent_at = now() where sent_at is null
$$;
grant execute on all functions in schema pg_temp to authenticated;
set local role authenticated;

select test.as_user('00000000-0000-0000-0000-000000000003');
select public.set_rsvp('b0000000-0000-0000-0000-000000000001', 'voy');
select test.ok((select body from pg_temp.q()) = 'Mili se sumó. Va 1.', 'quien organiza se entera de que alguien se sumó (con su apodo)');

select test.as_user('00000000-0000-0000-0000-000000000004');
select public.set_rsvp('b0000000-0000-0000-0000-000000000001', 'voy');
select test.ok((select total from pg_temp.q()) = 1, 'dos respuestas seguidas se agrupan en un solo aviso');
select test.ok((select body from pg_temp.q()) = 'Joaquín se sumó y hubo 1 respuesta más. Ya van 2.', 'el aviso agrupado dice la última y cuántas más');

select pg_temp.mark_sent();
select public.set_rsvp('b0000000-0000-0000-0000-000000000001', 'no');
select test.ok((select body from pg_temp.q()) = 'Joaquín se bajó. Va 1.', 'avisa cuando alguien se baja');
select pg_temp.mark_sent();
select public.set_rsvp('b0000000-0000-0000-0000-000000000001', null);
select test.ok((select total from pg_temp.q()) = 2, 'borrar un “no voy” no avisa');

select test.as_user('00000000-0000-0000-0000-000000000002');
select public.set_rsvp('b0000000-0000-0000-0000-000000000001', 'voy');
select test.ok((select total from pg_temp.q()) = 2, 'tu propia respuesta no te avisa');

select test.as_user('00000000-0000-0000-0000-000000000002');
select public.set_notification_prefs('{"respuestas": false}');
select test.as_user('00000000-0000-0000-0000-000000000004');
select public.set_rsvp('b0000000-0000-0000-0000-000000000001', 'voy');
select test.ok((select total from pg_temp.q()) = 2, 'respeta a quien desactivó estos avisos');

reset role;
\o
\echo '✔ Todos los tests de avisos de respuestas pasaron.'
rollback;
