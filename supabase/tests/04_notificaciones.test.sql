-- =====================================================================
-- Tests · Paso 4 (notificaciones: a quién se avisa y cuándo)
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
begin;
\ir _helpers.sql

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', '{"full_name":"Chava"}'),   -- coordinador
  ('00000000-0000-0000-0000-000000000002', '{"full_name":"Tini"}'),    -- rover, crea actividades
  ('00000000-0000-0000-0000-000000000003', '{"full_name":"Ramiro"}'),  -- educador
  ('00000000-0000-0000-0000-000000000004', '{"full_name":"Joaco"}'),   -- rover que desactivó "nuevas"
  ('00000000-0000-0000-0000-000000000006', '{"full_name":"Bruno"}'),   -- pide entrar
  ('00000000-0000-0000-0000-000000000005', '{"full_name":"Lucas"}');   -- otra comunidad
insert into public.communities (id, name, scout_group, city, status, created_by) values
  ('a0000000-0000-0000-0000-00000000000a', 'Los Andes', 'GS 1', 'Córdoba', 'activa', '00000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-00000000000b', 'Aconcagua', 'GS 2', 'Mendoza', 'activa', '00000000-0000-0000-0000-000000000005');
insert into public.memberships (community_id, user_id, role, status) values
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'coordinador', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', 'rover', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000003', 'educador', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000004', 'rover', 'activo'),
  ('a0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', 'coordinador', 'activo');
insert into public.notification_prefs (user_id, nueva) values ('00000000-0000-0000-0000-000000000004', false);

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
create function pg_temp.id(key text) returns uuid language sql as $$ select v from ids where k = key $$;
-- Contar mensajes en la cola (como superusuario: los usuarios no la pueden leer).
create function pg_temp.q(k text, uid text default null) returns bigint language sql security definer as $$
  select count(*) from public.notification_queue where kind::text = k and (uid is null or user_id = uid::uuid)
$$;
create function pg_temp.last(k text, col text) returns text language plpgsql security definer as $$
declare r text;
begin
  execute format('select %I from public.notification_queue where kind::text = %L order by id desc limit 1', col, k) into r;
  return r;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;

-- ===== Actividad nueva =====
select test.as_user('00000000-0000-0000-0000-000000000002');
insert into ids values ('reunion', public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Reunión', 'reunion',
  '2027-03-06 15:00-03', '2027-03-06 18:00-03', null, 'Sede'));
select test.ok(pg_temp.q('nueva') = 2, 'una actividad nueva avisa a 2: coordinador y educador');
select test.ok(pg_temp.q('nueva', '00000000-0000-0000-0000-000000000002') = 0, 'a quien la creó no le avisa');
select test.ok(pg_temp.q('nueva', '00000000-0000-0000-0000-000000000004') = 0, 'respeta a quien desactivó los avisos de nuevas');
select test.ok(pg_temp.q('nueva', '00000000-0000-0000-0000-000000000005') = 0, 'otra comunidad no recibe nada');

select public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Reunión semanal', 'reunion',
  '2027-03-13 15:00-03', '2027-03-13 18:00-03', null, null, null, '{"frequency":"semanal","until":"2027-05-29"}');
select test.ok(pg_temp.q('nueva') = 4, 'una serie de 12 fechas avisa una sola vez por persona');
select test.ok(pg_temp.last('nueva', 'body') like 'sáb 13/03 15:00%(se repite)%',
  'el aviso dice el día y la hora en la zona de la comunidad');

-- ===== Cambios y cancelaciones =====
select test.as_user('00000000-0000-0000-0000-000000000004');
select public.set_rsvp(pg_temp.id('reunion'), 'voy');
select test.as_user('00000000-0000-0000-0000-000000000003');
select public.set_rsvp(pg_temp.id('reunion'), 'no');

select test.as_user('00000000-0000-0000-0000-000000000002');
select public.update_activity(pg_temp.id('reunion'), 'Reunión', 'reunion', '2027-03-06 16:00-03', '2027-03-06 19:00-03', null, 'Sede');
select test.ok(pg_temp.q('cambio') = 1, 'cambiar el horario avisa solo a quien dijo que iba');
select public.update_activity(pg_temp.id('reunion'), 'Reunión (título nuevo)', 'reunion', '2027-03-06 16:00-03', '2027-03-06 19:00-03', null, 'Sede');
select test.ok(pg_temp.q('cambio') = 1, 'cambiar solo el título no manda otro aviso');
select public.update_activity(pg_temp.id('reunion'), 'Reunión', 'reunion', '2027-03-06 16:00-03', '2027-03-06 19:00-03', null, 'Plaza');
select test.ok(pg_temp.q('cambio') = 1, 'no se acumulan dos avisos de cambio sin enviar para la misma actividad');
select public.cancel_activity(pg_temp.id('reunion'));
select test.ok(pg_temp.q('cancelacion', '00000000-0000-0000-0000-000000000004') = 1, 'cancelar avisa a quien iba');
select test.ok(pg_temp.q('cancelacion', '00000000-0000-0000-0000-000000000003') = 0, 'cancelar no avisa a quien dijo que no iba');

-- Borrar "esta y las siguientes" de una serie: un solo aviso.
select test.as_user('00000000-0000-0000-0000-000000000004');
select public.set_rsvp(a.id, 'voy') from public.activities a where a.title = 'Reunión semanal';
select test.as_user('00000000-0000-0000-0000-000000000002');
select public.delete_activity((select id from public.activities where title = 'Reunión semanal' order by starts_at limit 1), 'esta_y_siguientes');
select test.ok(pg_temp.q('cancelacion', '00000000-0000-0000-0000-000000000004') = 2, 'borrar 12 fechas de una serie avisa una sola vez más');

-- ===== Solicitudes de ingreso =====
reset role;
insert into public.memberships (community_id, user_id) values ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000006');
set local role authenticated;
select test.ok(pg_temp.q('solicitud') = 1, 'una solicitud de ingreso avisa al coordinador');
select test.ok(pg_temp.q('solicitud', '00000000-0000-0000-0000-000000000001') = 1, '…y solo al coordinador');

-- ===== Recordatorios =====
reset role;
-- Actividad de dentro de 2 días respecto de un "ahora" fijo, creada hace mucho.
insert into public.activities (id, community_id, title, starts_at, ends_at, location, created_by, created_at) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Salida', '2027-04-10 08:00-03', '2027-04-10 18:00-03', 'Los Gigantes',
   '00000000-0000-0000-0000-000000000002', '2027-04-01 10:00-03');
insert into public.rsvps (activity_id, user_id, response) values ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'voy');

select test.ok(private.enqueue_reminders('2027-04-08 18:30-03') = 0, 'antes de las 19 h no se manda ningún recordatorio');
select test.ok(private.enqueue_reminders('2027-04-08 20:00-03') = 3, 'a las 20 h de pasado mañana: recordatorio a los 3 que no respondieron');
select test.ok(pg_temp.q('confirmar', '00000000-0000-0000-0000-000000000004') = 0, 'a quien ya respondió no le pide confirmar');
select test.ok(private.enqueue_reminders('2027-04-08 21:00-03') = 0, 'el recordatorio no se repite');
select test.ok(private.enqueue_reminders('2027-04-09 20:00-03') = 1, 'la noche anterior: recordatorio solo a quien dijo “voy”');
select test.ok(pg_temp.last('manana', 'title') = 'Mañana: Salida', 'el recordatorio dice “Mañana: …”');

-- ===== Permisos =====
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000000004');
select test.throws('select * from public.notification_queue', 'nadie lee la cola desde la app', 'permission denied');
select test.throws('select public.send_test_push()', 'sin dispositivo no se puede probar', 'no tiene las notificaciones');
select public.save_push_subscription('https://push.example.com/abc', 'BKEY', 'AUTH', 'iPhone');
select test.ok(test.n('select 1 from public.push_subscriptions') = 1, 'cada uno ve sus dispositivos');
select test.ok(public.send_test_push() = 1, 'con un dispositivo, se puede mandar una prueba');
select test.throws($$select public.save_push_subscription('http://inseguro.com', 'a', 'b')$$, 'solo se aceptan suscripciones https', 'inválida');
select public.set_notification_prefs('{"manana": false}');
select test.ok((select manana from public.notification_prefs) = false and (select nueva from public.notification_prefs) = false,
  'se cambia una preferencia sin tocar las otras');
select test.throws('select * from public.push_claim_batch()', 'la app no puede tomar mensajes de la cola', 'permission denied');
select test.throws('select public.push_config()', 'la app no ve las claves', 'permission denied');
select test.throws($$select private.configure_push('x', 'y')$$, 'la app no configura el servidor', 'permission denied');

select test.as_user('00000000-0000-0000-0000-000000000001');
select test.ok(test.n('select 1 from public.push_subscriptions') = 0, 'nadie ve dispositivos ajenos');

-- ===== Servidor (service_role) =====
reset role;
set local role service_role;
create temp table batch on commit drop as select * from public.push_claim_batch(500);
select test.ok((select count(*) from batch) = (select count(*) from public.notification_queue where sent_at is null), 'el servidor toma todos los pendientes');
select test.ok((select subs from batch b join public.notification_queue q on q.id = b.queue_id where q.kind = 'prueba')
  = '[{"auth": "AUTH", "p256dh": "BKEY", "endpoint": "https://push.example.com/abc"}]'::jsonb, 'cada mensaje trae los dispositivos del destinatario');
select test.ok((select count(*) from public.push_claim_batch(500)) = 0, 'lo tomado no se vuelve a tomar enseguida');
select public.push_finish(array(select queue_id from batch), array['https://push.example.com/abc']);
select test.ok((select count(*) from public.notification_queue where sent_at is null) = 0, 'quedan marcados como enviados');
select test.ok((select count(*) from public.push_subscriptions) = 0, 'los dispositivos dados de baja se borran');

reset role;
\o
\echo '✔ Todos los tests del paso 4 pasaron.'
rollback;
