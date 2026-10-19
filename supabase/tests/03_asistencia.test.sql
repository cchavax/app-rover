-- =====================================================================
-- Tests · Paso 3 (asistencia)
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
begin;
\ir _helpers.sql

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', '{"full_name":"Chava"}'),   -- coordinador
  ('00000000-0000-0000-0000-000000000002', '{"full_name":"Tini"}'),    -- rover (crea las actividades)
  ('00000000-0000-0000-0000-000000000003', '{"full_name":"Ramiro"}'),  -- educador
  ('00000000-0000-0000-0000-000000000004', '{"full_name":"Joaco"}'),   -- rover
  ('00000000-0000-0000-0000-000000000005', '{"full_name":"Lucas"}'),   -- otra comunidad
  ('00000000-0000-0000-0000-000000000006', '{"full_name":"Bruno"}');   -- pendiente

insert into public.communities (id, name, scout_group, city, status, created_by) values
  ('a0000000-0000-0000-0000-00000000000a', 'Los Andes', 'GS 1', 'Córdoba', 'activa', '00000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-00000000000b', 'Aconcagua', 'GS 2', 'Mendoza', 'activa', '00000000-0000-0000-0000-000000000005');
insert into public.memberships (community_id, user_id, role, status) values
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'coordinador', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', 'rover', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000003', 'educador', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000004', 'rover', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000006', 'rover', 'pendiente'),
  ('a0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', 'coordinador', 'activo');

-- Actividades: una futura, una que ya terminó, una cancelada.
insert into public.activities (id, community_id, title, starts_at, ends_at, created_by, status) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Futura', now() + interval '2 days', now() + interval '2 days 3 hours', '00000000-0000-0000-0000-000000000002', 'programada'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Pasada', now() - interval '1 day', now() - interval '21 hours', '00000000-0000-0000-0000-000000000002', 'programada'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'Cancelada', now() + interval '3 days', now() + interval '3 days 2 hours', '00000000-0000-0000-0000-000000000002', 'cancelada'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-00000000000a', 'En curso', now() - interval '1 hour', now() + interval '1 hour', '00000000-0000-0000-0000-000000000002', 'programada');

set local role authenticated;

-- ===== Responder =====
select test.as_user('00000000-0000-0000-0000-000000000004');
select public.set_rsvp('b0000000-0000-0000-0000-000000000001', 'voy');
select test.ok((select response from public.rsvps where user_id = auth.uid()) = 'voy', 'un rover responde “voy”');
select public.set_rsvp('b0000000-0000-0000-0000-000000000001', 'talvez');
select test.ok((select response from public.rsvps where user_id = auth.uid()) = 'talvez', 'puede cambiar la respuesta');
select public.set_rsvp('b0000000-0000-0000-0000-000000000001', null);
select test.ok(not exists (select 1 from public.rsvps where user_id = auth.uid()), 'puede borrar su respuesta');
select public.set_rsvp('b0000000-0000-0000-0000-000000000001', 'voy');

select test.throws($$select public.set_rsvp('b0000000-0000-0000-0000-000000000004', 'voy')$$, 'no se responde una actividad que ya empezó', 'ya empezó');
select test.throws($$select public.set_rsvp('b0000000-0000-0000-0000-000000000003', 'voy')$$, 'no se responde una actividad cancelada', 'cancelada');
select test.throws($$insert into public.rsvps (activity_id, user_id, response) values ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'no')$$,
  'nadie escribe respuestas directo (ni por otro)', 'permission denied');

select test.as_user('00000000-0000-0000-0000-000000000003');
select public.set_rsvp('b0000000-0000-0000-0000-000000000001', 'voy');
select test.ok(test.n($$select 1 from public.rsvps where response = 'voy'$$) = 2, 'el educador también confirma asistencia');

select test.as_user('00000000-0000-0000-0000-000000000006');
select test.throws($$select public.set_rsvp('b0000000-0000-0000-0000-000000000001', 'voy')$$, 'un pendiente no responde', 'no existe');
select test.ok(test.n('select 1 from public.rsvps') = 0, 'un pendiente no ve respuestas');

select test.as_user('00000000-0000-0000-0000-000000000005');
select test.throws($$select public.set_rsvp('b0000000-0000-0000-0000-000000000001', 'voy')$$, 'otra comunidad no responde', 'no existe');
select test.ok(test.n('select 1 from public.rsvps') = 0, 'otra comunidad no ve respuestas');

select test.as_user('00000000-0000-0000-0000-000000000002');
select test.ok(test.n('select 1 from public.rsvps') = 2, 'los miembros ven quién va');

-- ===== Tomar lista =====
select test.throws($$select public.save_attendance('b0000000-0000-0000-0000-000000000001', array['00000000-0000-0000-0000-000000000004']::uuid[])$$,
  'no se toma lista antes de que termine', 'termina');
select test.throws($$select public.save_attendance('b0000000-0000-0000-0000-000000000002', array['00000000-0000-0000-0000-000000000005']::uuid[])$$,
  'en la lista no puede haber gente de otra comunidad', 'miembros activos');
select test.throws($$select public.save_attendance('b0000000-0000-0000-0000-000000000002', array['00000000-0000-0000-0000-000000000006']::uuid[])$$,
  'en la lista no puede haber pendientes', 'miembros activos');
select test.ok(public.save_attendance('b0000000-0000-0000-0000-000000000002',
  array['00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004']::uuid[]) = 2,
  'quien creó la actividad toma lista (sin duplicados)');
select test.ok((select attendance_taken_at from public.activities where id = 'b0000000-0000-0000-0000-000000000002') is not null, 'queda marcado que se tomó lista');

select test.as_user('00000000-0000-0000-0000-000000000004');
select test.throws($$select public.save_attendance('b0000000-0000-0000-0000-000000000002', array[]::uuid[])$$,
  'otro rover no toma lista', 'Solo quien creó');
select test.ok(test.n('select 1 from public.attendance') = 2, 'los miembros ven la asistencia');

select test.as_user('00000000-0000-0000-0000-000000000003');
select test.throws($$select public.save_attendance('b0000000-0000-0000-0000-000000000002', array[]::uuid[])$$,
  'un educador no toma lista', 'Solo quien creó');

select test.as_user('00000000-0000-0000-0000-000000000001');
select test.ok(public.save_attendance('b0000000-0000-0000-0000-000000000002', array['00000000-0000-0000-0000-000000000002']::uuid[]) = 1,
  'un coordinador corrige la lista y reemplaza la anterior');
select test.ok(test.n('select 1 from public.attendance') = 1, 'la lista corregida reemplaza a la anterior');
select test.ok(public.save_attendance('b0000000-0000-0000-0000-000000000002', array[]::uuid[]) = 0, 'se puede guardar una lista vacía (no fue nadie)');

select test.as_user('00000000-0000-0000-0000-000000000005');
select test.ok(test.n('select 1 from public.attendance') = 0, 'otra comunidad no ve la asistencia');

reset role;
\o
\echo '✔ Todos los tests del paso 3 pasaron.'
rollback;
