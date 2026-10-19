-- =====================================================================
-- Mejoras pedidas por la comunidad:
--   * Ubicación exacta (pin en el mapa) en las actividades.
--   * Reprogramar (también una actividad suspendida).
--   * Notificaciones más claras.
-- =====================================================================

alter table public.activities
  add column location_lat double precision check (location_lat between -90 and 90),
  add column location_lng double precision check (location_lng between -180 and 180),
  add constraint activities_location_pair check ((location_lat is null) = (location_lng is null));

-- ---------- Textos en castellano para las notificaciones ----------
-- "sábado 14 de noviembre"
create function private.fmt_day(ts timestamptz, tz text) returns text
language sql immutable set search_path = '' as $$
  select (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[extract(dow from ts at time zone tz)::int + 1]
         || ' ' || extract(day from ts at time zone tz)::int
         || ' de ' || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from ts at time zone tz)::int]
$$;

-- "14 de noviembre"
create function private.fmt_date(ts timestamptz, tz text) returns text
language sql immutable set search_path = '' as $$
  select extract(day from ts at time zone tz)::int
         || ' de ' || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from ts at time zone tz)::int]
$$;

-- "15:00"
create function private.fmt_time(ts timestamptz, tz text) returns text
language sql immutable set search_path = '' as $$
  select to_char(ts at time zone tz, 'HH24:MI')
$$;

create function private.type_label(t public.activity_type) returns text
language sql immutable set search_path = '' as $$
  select case t when 'reunion' then 'Reunión' when 'campamento' then 'Campamento' when 'servicio' then 'Servicio'
                when 'salida' then 'Salida' else 'Actividad' end
$$;

-- "todos los sábados", "el 1.er sábado de cada mes", …
create function private.series_text(sid uuid) returns text
language sql stable set search_path = '' as $$
  select case s.frequency
    when 'semanal' then
      case when s.interval = 1 then 'todos los ' || d.day || 's'
           else 'cada ' || s.interval || ' semanas, los ' || d.day || 's' end
    when 'mensual_dia' then 'todos los meses el día ' || s.month_day
    else case when s.month_week = -1 then 'el último ' || d.day || ' de cada mes'
              else 'el ' || case when s.month_week in (1, 3) then s.month_week || '.er' else s.month_week || '.º' end
                   || ' ' || d.day || ' de cada mes' end
  end
  from public.activity_series s
  cross join lateral (select (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[coalesce(s.weekday, 0) + 1] as day) d
  where s.id = sid
$$;

-- =====================================================================
-- Actividades: crear y editar con ubicación en el mapa
-- (se reemplazan las funciones del paso 2 para sumar p_lat / p_lng)
-- =====================================================================
drop function public.create_activity(uuid, text, public.activity_type, timestamptz, timestamptz, text, text, uuid, jsonb);
drop function public.update_activity(uuid, text, public.activity_type, timestamptz, timestamptz, text, text, uuid, public.edit_scope);

create function public.create_activity(
  p_community_id uuid, p_title text, p_type public.activity_type,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_description text default null, p_location text default null,
  p_project_id uuid default null, p_recurrence jsonb default null,
  p_lat double precision default null, p_lng double precision default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  tz text;
  local_start timestamp;
  dur interval := p_ends_at - p_starts_at;
  freq public.recurrence_frequency;
  every int;
  until_d date;
  mweek int;
  sid uuid;
  first_id uuid;
  d date;
  new_id uuid;
begin
  if (p_lat is null) <> (p_lng is null) then raise exception 'La ubicación necesita latitud y longitud.'; end if;
  if not public.can_create_in(p_community_id) then
    raise exception 'No podés crear actividades en esta comunidad.';
  end if;
  if p_ends_at <= p_starts_at then raise exception 'El fin tiene que ser después del inicio.'; end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects where id = p_project_id and community_id = p_community_id and deleted_at is null
  ) then
    raise exception 'El proyecto no existe en esta comunidad.';
  end if;

  select timezone into tz from public.communities where id = p_community_id;
  local_start := p_starts_at at time zone tz;

  if p_recurrence is null or p_recurrence = 'null'::jsonb then
    insert into public.activities (community_id, project_id, title, description, type, starts_at, ends_at, location, location_lat, location_lng, created_by)
    values (p_community_id, p_project_id, trim(p_title), nullif(trim(p_description), ''), p_type, p_starts_at, p_ends_at,
            nullif(trim(p_location), ''), p_lat, p_lng, uid)
    returning id into first_id;
    return first_id;
  end if;

  freq   := (p_recurrence ->> 'frequency')::public.recurrence_frequency;
  every  := coalesce((p_recurrence ->> 'interval')::int, 1);
  until_d := (p_recurrence ->> 'until')::date;
  if every not between 1 and 12 then raise exception 'La repetición tiene que ser cada 1 a 12.'; end if;
  if until_d is null or until_d < local_start::date then raise exception 'La fecha “hasta” tiene que ser posterior al inicio.'; end if;
  if until_d > (local_start + interval '1 year')::date then raise exception 'Una serie puede durar como máximo un año.'; end if;

  if freq = 'mensual_semana' then
    mweek := case when coalesce((p_recurrence ->> 'last')::boolean, false) then -1
                  else ceil(extract(day from local_start) / 7.0)::int end;
  end if;

  insert into public.activity_series (community_id, frequency, interval, month_day, month_week, weekday, until_date, created_by)
  values (p_community_id, freq, every,
          case when freq = 'mensual_dia' then extract(day from local_start) end,
          mweek,
          case when freq <> 'mensual_dia' then extract(dow from local_start) end,
          until_d, uid)
  returning id into sid;

  for d in select * from public.recurrence_dates(local_start::date, until_d, freq, every, mweek) loop
    insert into public.activities (community_id, series_id, project_id, title, description, type, starts_at, ends_at, location, location_lat, location_lng, created_by)
    values (p_community_id, sid, p_project_id, trim(p_title), nullif(trim(p_description), ''), p_type,
            (d + local_start::time) at time zone tz,
            ((d + local_start::time) at time zone tz) + dur,
            nullif(trim(p_location), ''), p_lat, p_lng, uid)
    returning id into new_id;
    first_id := coalesce(first_id, new_id);
  end loop;

  if first_id is null then raise exception 'Con esa repetición no queda ninguna fecha. Revisá el día y la fecha “hasta”.'; end if;
  return first_id;
end $$;

create function public.update_activity(
  p_id uuid, p_title text, p_type public.activity_type,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_description text default null, p_location text default null,
  p_project_id uuid default null, p_scope public.edit_scope default 'solo_esta',
  p_lat double precision default null, p_lng double precision default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  a public.activities;
  tz text;
  new_time time;
  dur interval := p_ends_at - p_starts_at;
begin
  if (p_lat is null) <> (p_lng is null) then raise exception 'La ubicación necesita latitud y longitud.'; end if;
  select * into a from public.activities where id = p_id and deleted_at is null;
  if not found then raise exception 'La actividad no existe.'; end if;
  if a.created_by <> uid or not public.can_create_in(a.community_id) then
    raise exception 'Solo quien creó la actividad puede editarla.';
  end if;
  if p_ends_at <= p_starts_at then raise exception 'El fin tiene que ser después del inicio.'; end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects where id = p_project_id and community_id = a.community_id and deleted_at is null
  ) then
    raise exception 'El proyecto no existe en esta comunidad.';
  end if;

  update public.activities
     set title = trim(p_title), type = p_type, starts_at = p_starts_at, ends_at = p_ends_at,
         description = nullif(trim(p_description), ''), location = nullif(trim(p_location), ''),
         project_id = p_project_id, location_lat = p_lat, location_lng = p_lng
   where id = a.id;

  if p_scope = 'esta_y_siguientes' and a.series_id is not null then
    select timezone into tz from public.communities where id = a.community_id;
    new_time := (p_starts_at at time zone tz)::time;
    update public.activities x
       set title = trim(p_title), type = p_type,
           description = nullif(trim(p_description), ''), location = nullif(trim(p_location), ''),
           project_id = p_project_id, location_lat = p_lat, location_lng = p_lng,
           starts_at = ((x.starts_at at time zone tz)::date + new_time) at time zone tz,
           ends_at   = (((x.starts_at at time zone tz)::date + new_time) at time zone tz) + dur
     where x.series_id = a.series_id and x.id <> a.id and x.starts_at > a.starts_at
       and x.deleted_at is null and x.created_by = uid;
  end if;
end $$;

-- =====================================================================
-- Reprogramar: nueva fecha y hora. Si estaba suspendida, vuelve a estar programada.
-- Las respuestas se mantienen y se avisa a quienes iban.
-- =====================================================================
create function public.reschedule_activity(p_id uuid, p_starts_at timestamptz, p_ends_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); a public.activities;
begin
  select * into a from public.activities where id = p_id and deleted_at is null;
  if not found then raise exception 'La actividad no existe.'; end if;
  if a.created_by <> uid or not public.can_create_in(a.community_id) then
    raise exception 'Solo quien creó la actividad puede reprogramarla.';
  end if;
  if p_ends_at <= p_starts_at then raise exception 'El fin tiene que ser después del inicio.'; end if;
  if p_starts_at <= now() then raise exception 'La nueva fecha tiene que ser en el futuro.'; end if;
  update public.activities
     set starts_at = p_starts_at, ends_at = p_ends_at, status = 'programada', attendance_taken_at = null
   where id = a.id;
end $$;

-- =====================================================================
-- Notificaciones con textos más claros
-- =====================================================================
create or replace function private.on_activity_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tz text; msg text;
begin
  if new.series_id is not null and exists (
    select 1 from public.activities where series_id = new.series_id and id <> new.id
  ) then
    return new;
  end if;
  if new.starts_at <= now() then return new; end if;
  select timezone into tz from public.communities where id = new.community_id;

  -- "Salida nueva para el sábado 14 de noviembre a las 15:00 en Reserva Natural. ¿Vas?"
  -- "Reunión nueva, todos los sábados desde el 14 de noviembre a las 15:00 en la Sede. ¿Vas?"
  msg := private.type_label(new.type) || ' nueva'
      || case when new.series_id is not null
              then ', ' || coalesce(private.series_text(new.series_id), 'que se repite') || ' desde el ' || private.fmt_date(new.starts_at, tz)
              else ' para el ' || private.fmt_day(new.starts_at, tz) end
      || ' a las ' || private.fmt_time(new.starts_at, tz)
      || coalesce(' en ' || new.location, '')
      || '. ¿Vas?';
  if new.type = 'otro' then msg := replace(msg, 'Actividad nueva', 'Nueva actividad'); end if;

  insert into public.notification_queue (user_id, kind, activity_id, community_id, title, body, url)
  select m.user_id, 'nueva', new.id, new.community_id, new.title, msg, '/actividades/' || new.id
  from public.memberships m
  where m.community_id = new.community_id and m.status = 'activo'
    and m.user_id <> new.created_by
    and private.wants(m.user_id, 'nueva');
  return new;
end $$;

create or replace function private.on_activity_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tz text;
begin
  if new.starts_at <= now() and old.starts_at <= now() then return new; end if;
  select timezone into tz from public.communities where id = new.community_id;

  if old.status = 'programada' and new.status = 'cancelada' then
    perform private.notify_attendees(new, 'cancelacion', 'Se suspendió: ' || new.title,
      'Estaba para el ' || private.fmt_day(new.starts_at, tz) || ' a las ' || private.fmt_time(new.starts_at, tz) || '.');
  elsif old.deleted_at is null and new.deleted_at is not null and new.status = 'programada' then
    perform private.notify_attendees(new, 'cancelacion', 'Se suspendió: ' || new.title,
      'Estaba para el ' || private.fmt_day(new.starts_at, tz) || ' a las ' || private.fmt_time(new.starts_at, tz) || '.');
  elsif old.status = 'cancelada' and new.status = 'programada' then
    perform private.notify_attendees(new, 'cambio', 'Vuelve: ' || new.title,
      'Se reprogramó para el ' || private.fmt_day(new.starts_at, tz) || ' a las ' || private.fmt_time(new.starts_at, tz)
      || coalesce(' en ' || new.location, '') || '. Si ya no podés, cambiá tu respuesta.');
  elsif new.deleted_at is null and new.status = 'programada' and new.starts_at > now()
        and (new.starts_at <> old.starts_at or new.ends_at <> old.ends_at) then
    perform private.notify_attendees(new, 'cambio', 'Cambió el horario: ' || new.title,
      'Ahora es el ' || private.fmt_day(new.starts_at, tz) || ' a las ' || private.fmt_time(new.starts_at, tz)
      || coalesce(' en ' || new.location, '') || '. Si ya no podés, cambiá tu respuesta.');
  elsif new.deleted_at is null and new.status = 'programada' and new.starts_at > now()
        and (new.location is distinct from old.location or new.location_lat is distinct from old.location_lat
             or new.location_lng is distinct from old.location_lng) then
    perform private.notify_attendees(new, 'cambio', 'Cambió el lugar: ' || new.title,
      coalesce('Ahora es en ' || new.location, 'Se sacó el lugar') || ', el ' || private.fmt_day(new.starts_at, tz)
      || ' a las ' || private.fmt_time(new.starts_at, tz) || '.');
  end if;
  return new;
end $$;

create or replace function private.enqueue_reminders(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare n1 int; n2 int;
begin
  insert into public.notification_queue (user_id, kind, activity_id, community_id, title, body, url)
  select m.user_id, 'confirmar', a.id, a.community_id,
         '¿Vas a ' || a.title || '?',
         'Es pasado mañana, ' || private.fmt_day(a.starts_at, c.timezone) || ' a las ' || private.fmt_time(a.starts_at, c.timezone)
           || coalesce(' en ' || a.location, '') || '. Tocá para responder.',
         '/actividades/' || a.id
  from public.activities a
  join public.communities c on c.id = a.community_id and c.status = 'activa'
  join public.memberships m on m.community_id = a.community_id and m.status = 'activo'
  where a.deleted_at is null and a.status = 'programada'
    and (a.starts_at at time zone c.timezone)::date = (p_now at time zone c.timezone)::date + 2
    and extract(hour from p_now at time zone c.timezone) >= 19
    and a.created_at < p_now - interval '12 hours'
    and not exists (select 1 from public.rsvps r where r.activity_id = a.id and r.user_id = m.user_id)
    and private.wants(m.user_id, 'confirmar')
  on conflict (user_id, activity_id, kind) where kind in ('confirmar', 'manana') do nothing;
  get diagnostics n1 = row_count;

  insert into public.notification_queue (user_id, kind, activity_id, community_id, title, body, url)
  select r.user_id, 'manana', a.id, a.community_id,
         'Mañana: ' || a.title,
         'A las ' || private.fmt_time(a.starts_at, c.timezone) || coalesce(' en ' || a.location, '') || '. ¡Nos vemos!',
         '/actividades/' || a.id
  from public.activities a
  join public.communities c on c.id = a.community_id and c.status = 'activa'
  join public.rsvps r on r.activity_id = a.id and r.response = 'voy'
  join public.memberships m on m.community_id = a.community_id and m.user_id = r.user_id and m.status = 'activo'
  where a.deleted_at is null and a.status = 'programada'
    and (a.starts_at at time zone c.timezone)::date = (p_now at time zone c.timezone)::date + 1
    and extract(hour from p_now at time zone c.timezone) >= 19
    and private.wants(r.user_id, 'manana')
  on conflict (user_id, activity_id, kind) where kind in ('confirmar', 'manana') do nothing;
  get diagnostics n2 = row_count;

  delete from public.notification_queue where sent_at < p_now - interval '30 days';
  return n1 + n2;
end $$;

-- ---------- Permisos de ejecución ----------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  public.create_activity(uuid, text, public.activity_type, timestamptz, timestamptz, text, text, uuid, jsonb, double precision, double precision),
  public.update_activity(uuid, text, public.activity_type, timestamptz, timestamptz, text, text, uuid, public.edit_scope, double precision, double precision),
  public.reschedule_activity(uuid, timestamptz, timestamptz)
to authenticated;
