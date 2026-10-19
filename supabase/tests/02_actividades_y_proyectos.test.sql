-- =====================================================================
-- Tests · Paso 2 (actividades, recurrencias, proyectos, papelera)
-- Fechas fijas en 2027 para que no dependan del día en que se corren.
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
begin;
\ir _helpers.sql

-- ---------- Escenario (armado directo, sin RPCs: eso ya lo prueba el paso 1) ----------
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', '{"full_name":"Chava"}'),   -- coordinador Andes
  ('00000000-0000-0000-0000-000000000002', '{"full_name":"Tini"}'),    -- rover Andes
  ('00000000-0000-0000-0000-000000000003', '{"full_name":"Ramiro"}'),  -- educador Andes
  ('00000000-0000-0000-0000-000000000004', '{"full_name":"Joaco"}'),   -- rover Andes
  ('00000000-0000-0000-0000-000000000005', '{"full_name":"Lucas"}'),   -- coordinador Aconcagua
  ('00000000-0000-0000-0000-000000000006', '{"full_name":"Pendi"}');   -- coordinador de comunidad pendiente

insert into public.communities (id, name, scout_group, city, status, created_by) values
  ('a0000000-0000-0000-0000-00000000000a', 'Los Andes', 'GS 1', 'Córdoba', 'activa', '00000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-00000000000b', 'Aconcagua', 'GS 2', 'Mendoza', 'activa', '00000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-00000000000c', 'Pendiente', 'GS 3', 'Salta', 'pendiente', '00000000-0000-0000-0000-000000000006');

insert into public.memberships (community_id, user_id, role, status) values
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'coordinador', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', 'rover', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000003', 'educador', 'activo'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000004', 'rover', 'activo'),
  ('a0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', 'coordinador', 'activo'),
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000006', 'coordinador', 'activo');

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
-- Atajo para leer ids guardados.
create function pg_temp.id(key text) returns uuid language sql as $$ select v from ids where k = key $$;

set local role authenticated;
set local timezone = 'UTC';  -- a propósito distinto de la comunidad: las horas locales tienen que salir igual

-- ===== Crear: permisos =====
select test.as_user('00000000-0000-0000-0000-000000000003');
select test.throws($$select public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Reunión', 'reunion',
  '2027-03-06 15:00-03', '2027-03-06 18:00-03')$$, 'un educador no puede crear actividades', 'No podés crear');

select test.as_user('00000000-0000-0000-0000-000000000006');
select test.throws($$select public.create_activity('a0000000-0000-0000-0000-00000000000c', 'Reunión', 'reunion',
  '2027-03-06 15:00-03', '2027-03-06 18:00-03')$$, 'en una comunidad pendiente no se crean actividades', 'No podés crear');

select test.as_user('00000000-0000-0000-0000-000000000005');
select test.throws($$select public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Reunión', 'reunion',
  '2027-03-06 15:00-03', '2027-03-06 18:00-03')$$, 'nadie crea actividades en otra comunidad', 'No podés crear');

select test.as_user('00000000-0000-0000-0000-000000000002');
select test.throws($$select public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Reunión', 'reunion',
  '2027-03-06 18:00-03', '2027-03-06 15:00-03')$$, 'el fin tiene que ser después del inicio', 'fin');
select test.throws($$insert into public.activities (community_id, title, starts_at, ends_at, created_by)
  values ('a0000000-0000-0000-0000-00000000000a', 'Directo', now(), now() + interval '1 hour', auth.uid())$$,
  'nadie inserta actividades directo', 'permission denied');

-- ===== Recurrencias =====
-- Semanal: sábados del 6/3 al 24/4 → 8 reuniones.
insert into ids values ('semanal', public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Reunión de comunidad', 'reunion',
  '2027-03-06 15:00-03', '2027-03-06 18:00-03', 'Traer mate', 'Sede', null,
  '{"frequency":"semanal","interval":1,"until":"2027-04-24"}'));
select test.ok(test.n(format('select 1 from public.activities where series_id = (select series_id from public.activities where id = %L)', pg_temp.id('semanal'))) = 8,
  'semanal del 6/3 al 24/4 crea 8 reuniones');
select test.ok(not exists (
  select 1 from public.activities where series_id = (select series_id from public.activities where id = pg_temp.id('semanal'))
    and (extract(hour from starts_at at time zone 'America/Argentina/Cordoba') <> 15 or extract(dow from starts_at at time zone 'America/Argentina/Cordoba') <> 6
         or ends_at - starts_at <> interval '3 hours')),
  'todas caen sábado a las 15 h (hora de la comunidad) y duran 3 horas');

-- Cada 2 semanas: 6/3, 20/3, 3/4, 17/4.
insert into ids values ('quincenal', public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Servicio', 'servicio',
  '2027-03-06 09:00-03', '2027-03-06 12:00-03', null, null, null, '{"frequency":"semanal","interval":2,"until":"2027-04-24"}'));
select test.ok((select array_agg((starts_at at time zone 'America/Argentina/Cordoba')::date order by starts_at)::text
  from public.activities where series_id = (select series_id from public.activities where id = pg_temp.id('quincenal')))
  = '{2027-03-06,2027-03-20,2027-04-03,2027-04-17}', 'cada 2 semanas cae en las fechas correctas');

-- Mensual el día 31: solo meses que lo tienen.
insert into ids values ('dia31', public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Cierre de mes', 'otro',
  '2027-01-31 20:00-03', '2027-01-31 21:00-03', null, null, null, '{"frequency":"mensual_dia","until":"2027-06-30"}'));
select test.ok((select array_agg((starts_at at time zone 'America/Argentina/Cordoba')::date order by starts_at)::text
  from public.activities where series_id = (select series_id from public.activities where id = pg_temp.id('dia31')))
  = '{2027-01-31,2027-03-31,2027-05-31}', 'mensual el 31 saltea los meses que no tienen 31');

-- Primer sábado de cada mes.
insert into ids values ('primersab', public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Consejo de comunidad', 'reunion',
  '2027-03-06 10:00-03', '2027-03-06 11:00-03', null, null, null, '{"frequency":"mensual_semana","until":"2027-06-30"}'));
select test.ok((select array_agg((starts_at at time zone 'America/Argentina/Cordoba')::date order by starts_at)::text
  from public.activities where series_id = (select series_id from public.activities where id = pg_temp.id('primersab')))
  = '{2027-03-06,2027-04-03,2027-05-01,2027-06-05}', 'el primer sábado de cada mes');

-- Último domingo de cada mes.
insert into ids values ('ultdom', public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Misa de comunidad', 'otro',
  '2027-03-28 11:00-03', '2027-03-28 12:00-03', null, null, null, '{"frequency":"mensual_semana","last":true,"until":"2027-06-30"}'));
select test.ok((select array_agg((starts_at at time zone 'America/Argentina/Cordoba')::date order by starts_at)::text
  from public.activities where series_id = (select series_id from public.activities where id = pg_temp.id('ultdom')))
  = '{2027-03-28,2027-04-25,2027-05-30,2027-06-27}', 'el último domingo de cada mes');

-- Quinto sábado: solo en los meses que lo tienen.
insert into ids values ('quintosab', public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Fogón largo', 'salida',
  '2027-01-30 20:00-03', '2027-01-30 23:00-03', null, null, null, '{"frequency":"mensual_semana","until":"2027-06-30"}'));
select test.ok((select array_agg((starts_at at time zone 'America/Argentina/Cordoba')::date order by starts_at)::text
  from public.activities where series_id = (select series_id from public.activities where id = pg_temp.id('quintosab')))
  = '{2027-01-30,2027-05-29}', 'el quinto sábado solo cae en los meses que lo tienen');

select test.throws($$select public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Eterna', 'reunion',
  '2027-03-06 15:00-03', '2027-03-06 18:00-03', null, null, null, '{"frequency":"semanal","until":"2029-01-01"}')$$,
  'una serie no puede durar más de un año', 'un año');
select test.throws($$select public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Al revés', 'reunion',
  '2027-03-06 15:00-03', '2027-03-06 18:00-03', null, null, null, '{"frequency":"semanal","until":"2027-01-01"}')$$,
  'la fecha hasta no puede ser anterior al inicio', 'hasta');

-- ===== Editar =====
select test.as_user('00000000-0000-0000-0000-000000000004'); -- joaco, otro rover
select test.throws(format($$select public.update_activity(%L, 'Hackeada', 'reunion', '2027-03-06 15:00-03', '2027-03-06 18:00-03')$$, pg_temp.id('semanal')),
  'un rover no edita actividades de otro', 'Solo quien creó');
select test.throws(format('select public.delete_activity(%L)', pg_temp.id('semanal')), 'un rover no borra actividades de otro', 'Solo quien creó');
select test.throws(format('select public.cancel_activity(%L)', pg_temp.id('semanal')), 'un rover no cancela actividades de otro', 'Solo quien creó');

select test.as_user('00000000-0000-0000-0000-000000000001'); -- chava, coordinador
select test.throws(format($$select public.update_activity(%L, 'Hackeada', 'reunion', '2027-03-06 15:00-03', '2027-03-06 18:00-03')$$, pg_temp.id('semanal')),
  'tampoco un coordinador edita actividades ajenas', 'Solo quien creó');

select test.as_user('00000000-0000-0000-0000-000000000002'); -- tini, creadora
-- "Solo esta": cambia la tercera reunión de lugar y horario.
insert into ids values ('tercera', (select id from public.activities where series_id = (select series_id from public.activities where id = pg_temp.id('semanal')) order by starts_at offset 2 limit 1));
select public.update_activity(pg_temp.id('tercera'), 'Reunión en la plaza', 'reunion', '2027-03-20 16:00-03', '2027-03-20 19:00-03', 'Traer mate', 'Plaza España', null, 'solo_esta');
select test.ok((select location from public.activities where id = pg_temp.id('tercera')) = 'Plaza España', '“solo esta” cambia esa reunión');
select test.ok(test.n(format($$select 1 from public.activities where series_id = (select series_id from public.activities where id = %L) and location = 'Plaza España'$$, pg_temp.id('semanal'))) = 1,
  '“solo esta” no toca las demás');

-- "Esta y las siguientes" desde la quinta: pasan a las 17 h y cambia el título.
insert into ids values ('quinta', (select id from public.activities where series_id = (select series_id from public.activities where id = pg_temp.id('semanal')) order by starts_at offset 4 limit 1));
select public.update_activity(pg_temp.id('quinta'), 'Reunión (horario nuevo)', 'reunion', '2027-04-03 17:00-03', '2027-04-03 20:00-03', null, 'Sede', null, 'esta_y_siguientes');
select test.ok(test.n(format($$select 1 from public.activities where series_id = (select series_id from public.activities where id = %L) and title = 'Reunión (horario nuevo)'$$, pg_temp.id('semanal'))) = 4,
  '“esta y las siguientes” cambia la quinta y las 3 que siguen');
select test.ok(not exists (select 1 from public.activities where series_id = (select series_id from public.activities where id = pg_temp.id('semanal'))
  and title = 'Reunión (horario nuevo)' and (extract(hour from starts_at at time zone 'America/Argentina/Cordoba') <> 17 or extract(dow from starts_at at time zone 'America/Argentina/Cordoba') <> 6)),
  'las siguientes pasan a las 17 h y siguen cayendo sábado');
select test.ok((select title from public.activities where id = pg_temp.id('semanal')) = 'Reunión de comunidad', 'las anteriores no cambian');

-- ===== Cancelar =====
insert into ids values ('pasada', public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Ya pasó', 'otro', now() - interval '2 hours', now() - interval '1 hour'));
select test.throws(format('select public.cancel_activity(%L)', pg_temp.id('pasada')), 'no se cancela una actividad que ya empezó', 'ya empezó');
select public.cancel_activity(pg_temp.id('quincenal'));
select test.ok((select status from public.activities where id = pg_temp.id('quincenal')) = 'cancelada', 'quien la creó puede cancelarla');

-- ===== Papelera =====
select test.ok(public.delete_activity(pg_temp.id('quinta'), 'esta_y_siguientes') = 4, 'borrar “esta y las siguientes” borra 4');
select test.ok(test.n(format('select 1 from public.activities where id = %L', pg_temp.id('quinta'))) = 1, 'quien borró sigue viéndola (papelera)');

select test.as_user('00000000-0000-0000-0000-000000000004');
select test.ok(test.n(format('select 1 from public.activities where id = %L', pg_temp.id('quinta'))) = 0, 'otro rover ya no ve lo borrado');
select test.throws(format('select public.restore_activity(%L)', pg_temp.id('quinta')), 'otro rover no restaura', 'Solo quien la creó');

select test.as_user('00000000-0000-0000-0000-000000000001');
select test.ok(test.n(format('select 1 from public.activities where id = %L', pg_temp.id('quinta'))) = 1, 'el coordinador ve lo borrado en la papelera');
select public.restore_activity(pg_temp.id('quinta'));
select test.as_user('00000000-0000-0000-0000-000000000004');
select test.ok(test.n(format('select 1 from public.activities where id = %L', pg_temp.id('quinta'))) = 1, 'restaurada, todos la ven de nuevo');

-- ===== Visibilidad =====
select test.as_user('00000000-0000-0000-0000-000000000003');
select test.ok(test.n('select 1 from public.activities where deleted_at is null') > 0, 'el educador ve el calendario');
select test.as_user('00000000-0000-0000-0000-000000000005');
select test.ok(test.n('select 1 from public.activities') = 0, 'otra comunidad no ve ninguna actividad');
select test.ok(test.n('select 1 from public.activity_series') = 0, 'otra comunidad no ve las series');

-- ===== Proyectos =====
select test.as_user('00000000-0000-0000-0000-000000000002'); -- tini crea con Joaco de responsable
insert into ids values ('huerta', public.save_project(null, 'a0000000-0000-0000-0000-00000000000a', 'Huerta comunitaria', '2027-03-01', '2027-06-30', 'en_curso',
  array['00000000-0000-0000-0000-000000000004']::uuid[], 'Que el barrio tenga huerta', null));
select test.ok(test.n(format('select 1 from public.project_owners where project_id = %L', pg_temp.id('huerta'))) = 1, 'el proyecto se crea con su responsable');
select test.throws($$select public.save_project(null, 'a0000000-0000-0000-0000-00000000000a', 'Sin dueño', '2027-03-01', '2027-06-30', 'idea', array[]::uuid[])$$,
  'un proyecto necesita al menos un responsable', 'responsable');
select test.throws($$select public.save_project(null, 'a0000000-0000-0000-0000-00000000000a', 'Con educador', '2027-03-01', '2027-06-30', 'idea',
  array['00000000-0000-0000-0000-000000000003']::uuid[])$$, 'un educador no puede ser responsable', 'rovers activos');
select test.throws($$select public.save_project(null, 'a0000000-0000-0000-0000-00000000000a', 'Con ajeno', '2027-03-01', '2027-06-30', 'idea',
  array['00000000-0000-0000-0000-000000000005']::uuid[])$$, 'alguien de otra comunidad no puede ser responsable', 'rovers activos');

select public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Jornada en la huerta', 'servicio',
  '2027-03-07 09:00-03', '2027-03-07 13:00-03', null, 'Huerta', pg_temp.id('huerta'));
select test.ok(test.n(format('select 1 from public.activities where project_id = %L', pg_temp.id('huerta'))) = 1, 'una actividad puede pertenecer a un proyecto');

select test.as_user('00000000-0000-0000-0000-000000000004'); -- joaco, responsable (no creador)
select public.save_project(pg_temp.id('huerta'), 'a0000000-0000-0000-0000-00000000000a', 'Huerta comunitaria (2.ª etapa)', '2027-03-01', '2027-07-31', 'en_curso',
  array['00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002']::uuid[]);
select test.ok((select name from public.projects where id = pg_temp.id('huerta')) = 'Huerta comunitaria (2.ª etapa)', 'un responsable puede editar el proyecto');
select test.throws(format('select public.delete_project(%L)', pg_temp.id('huerta')), 'un responsable que no lo creó no lo puede borrar', 'Solo quien creó');

select test.as_user('00000000-0000-0000-0000-000000000003');
select test.throws(format($$select public.save_project(%L, 'a0000000-0000-0000-0000-00000000000a', 'Educador edita', '2027-03-01', '2027-07-31', 'en_curso', array['00000000-0000-0000-0000-000000000004']::uuid[])$$, pg_temp.id('huerta')),
  'un educador no edita proyectos', 'Solo quien creó');

select test.as_user('00000000-0000-0000-0000-000000000005');
insert into ids values ('ajeno', public.save_project(null, 'a0000000-0000-0000-0000-00000000000b', 'Proyecto de Aconcagua', '2027-03-01', '2027-06-30', 'idea',
  array['00000000-0000-0000-0000-000000000005']::uuid[]));
select test.ok(test.n('select 1 from public.projects') = 1, 'cada comunidad ve solo sus proyectos');
select test.as_user('00000000-0000-0000-0000-000000000002');
select test.throws(format($$select public.create_activity('a0000000-0000-0000-0000-00000000000a', 'Truchada', 'otro', '2027-03-07 09:00-03', '2027-03-07 10:00-03', null, null, %L)$$, pg_temp.id('ajeno')),
  'no se puede colgar una actividad de un proyecto de otra comunidad', 'no existe');

select public.delete_project(pg_temp.id('huerta'));
select test.as_user('00000000-0000-0000-0000-000000000004');
select test.ok(test.n(format('select 1 from public.projects where id = %L', pg_temp.id('huerta'))) = 0, 'el proyecto borrado desaparece para los demás');
select test.ok(test.n(format('select 1 from public.activities where project_id = %L', pg_temp.id('huerta'))) = 1, 'sus actividades se mantienen');

-- ===== Transferir lo de alguien que se va =====
select test.as_user('00000000-0000-0000-0000-000000000002');
select test.throws($$select public.transfer_ownership('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004')$$,
  'un rover no transfiere', 'Solo quien coordina');
select test.as_user('00000000-0000-0000-0000-000000000001');
select test.throws($$select public.transfer_ownership('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003')$$,
  'no se transfiere a un educador', 'rover activo');
select test.ok(public.transfer_ownership('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004') > 0,
  'el coordinador transfiere todo lo de Tini a Joaco');
select test.ok(not exists (select 1 from public.activities where created_by = '00000000-0000-0000-0000-000000000002'), 'Tini ya no figura como creadora de nada');
select test.as_user('00000000-0000-0000-0000-000000000004');
select public.update_activity(pg_temp.id('tercera'), 'Ahora es de Joaco', 'reunion', '2027-03-20 16:00-03', '2027-03-20 19:00-03');
select test.ok((select title from public.activities where id = pg_temp.id('tercera')) = 'Ahora es de Joaco', 'el nuevo dueño puede editar');

reset role;
\o
\echo '✔ Todos los tests del paso 2 pasaron.'
rollback;
