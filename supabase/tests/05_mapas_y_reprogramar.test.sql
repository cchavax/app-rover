-- =====================================================================
-- Tests · Mapas, reprogramar y textos de las notificaciones
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
begin;
\ir _helpers.sql

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', '{"full_name":"Chava"}'),
  ('00000000-0000-0000-0000-000000000002', '{"full_name":"Felipe"}'),
  ('00000000-0000-0000-0000-000000000003', '{"full_name":"Mili"}');
insert into public.communities (id, name, scout_group, city, status, created_by) values
  ('a0000000-0000-0000-0000-00000000000a', 'Los Andes', 'GS 1', 'Córdoba', 'activa', '00000000-0000-0000-0000-000000000001');
insert into public.memberships (community_id, user_id, role, status) values
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'coordinador', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', 'rover', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000003', 'rover', 'activo');

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
create function pg_temp.id(key text) returns uuid language sql as $$ select v from ids where k = key $$;
create function pg_temp.last(k text, col text) returns text language plpgsql security definer as $$
declare r text;
begin
  execute format('select %I from public.notification_queue where kind::text = %L order by id desc limit 1', col, k) into r;
  return r;
end $$;
grant execute on all functions in schema pg_temp to authenticated;
set local role authenticated;

-- ===== Ubicación en el mapa =====
select test.as_user('00000000-0000-0000-0000-000000000002');
insert into ids values ('taller', public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Taller de mochila', 'salida',
  '2027-11-13 15:00-03', '2027-11-13 18:00-03', null, 'Reserva San Martín', null, null, -31.3846, -64.2392));
select test.ok((select location_lat from public.activities where id = pg_temp.id('taller')) = -31.3846, 'se guarda el punto del mapa');
select test.throws($$select public.create_activity('a0000000-0000-0000-0000-00000000000a', 'X', 'salida',
  '2027-11-13 15:00-03', '2027-11-13 18:00-03', null, null, null, null, -31.4, null)$$, 'la ubicación necesita latitud y longitud', 'latitud');
select test.throws($$select public.create_activity('a0000000-0000-0000-0000-00000000000a', 'X', 'salida',
  '2027-11-13 15:00-03', '2027-11-13 18:00-03', null, null, null, null, 120, 10)$$, 'una latitud imposible se rechaza', 'check');

-- ===== Texto de la notificación =====
select test.ok(pg_temp.last('nueva', 'title') = 'Taller de mochila', 'el título de la notificación es solo el nombre (no se corta)');
select test.ok(pg_temp.last('nueva', 'body') = 'Salida nueva para el sábado 13 de noviembre a las 15:00 en Reserva San Martín. ¿Vas?',
  'el texto dice qué es, cuándo y dónde, en castellano');

select public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Consejo', 'reunion',
  '2027-11-06 10:00-03', '2027-11-06 11:00-03', null, null, null, '{"frequency":"mensual_semana","until":"2028-02-28"}');
select test.ok(pg_temp.last('nueva', 'body') = 'Reunión nueva, el 1.er sábado de cada mes desde el 6 de noviembre a las 10:00. ¿Vas?',
  'en una serie, el aviso dice cómo se repite');

-- ===== Reprogramar =====
select test.as_user('00000000-0000-0000-0000-000000000003');
select public.set_rsvp(pg_temp.id('taller'), 'voy');
select test.throws(format($$select public.reschedule_activity(%L, '2027-11-20 15:00-03', '2027-11-20 18:00-03')$$, pg_temp.id('taller')),
  'solo quien la creó la reprograma', 'Solo quien creó');

select test.as_user('00000000-0000-0000-0000-000000000002');
select test.throws(format($$select public.reschedule_activity(%L, '2020-01-01 15:00-03', '2020-01-01 18:00-03')$$, pg_temp.id('taller')),
  'no se reprograma al pasado', 'futuro');
select public.cancel_activity(pg_temp.id('taller'));
select test.ok(pg_temp.last('cancelacion', 'title') = 'Se suspendió: Taller de mochila', 'suspender avisa con un título claro');

select public.reschedule_activity(pg_temp.id('taller'), '2027-11-20 16:00-03', '2027-11-20 19:00-03');
select test.ok((select status from public.activities where id = pg_temp.id('taller')) = 'programada', 'reprogramar una suspendida la vuelve a programar');
select test.ok((select response from public.rsvps where activity_id = pg_temp.id('taller')) = 'voy', 'las respuestas se mantienen');
select test.ok(pg_temp.last('cambio', 'title') = 'Vuelve: Taller de mochila', 'avisa que vuelve');
select test.ok(pg_temp.last('cambio', 'body') = 'Se reprogramó para el sábado 20 de noviembre a las 16:00 en Reserva San Martín. Si ya no podés, cambiá tu respuesta.',
  'y para cuándo quedó');

-- Mover el pin avisa a los que van (cambió el lugar).
reset role;
update public.notification_queue set sent_at = now();
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000000002');
select public.update_activity(pg_temp.id('taller'), 'Taller de mochila', 'salida', '2027-11-20 16:00-03', '2027-11-20 19:00-03',
  null, 'Reserva San Martín', null, 'solo_esta', -31.3900, -64.2400);
select test.ok(pg_temp.last('cambio', 'title') = 'Cambió el lugar: Taller de mochila', 'mover el pin avisa que cambió el lugar');

reset role;
\o
\echo '✔ Todos los tests de mapas y reprogramar pasaron.'
rollback;
