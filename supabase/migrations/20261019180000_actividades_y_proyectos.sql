-- =====================================================================
-- Paso 2 · Actividades (con recurrencias), proyectos y papelera
-- Ver docs/PLAN.md.
--
-- Igual que en el paso 1: el cliente solo LEE estas tablas directo.
-- Todo lo que escribe pasa por RPCs que validan permisos y reglas.
-- =====================================================================

-- ---------- Tipos ----------
create type public.activity_type as enum ('reunion', 'campamento', 'servicio', 'salida', 'otro');
create type public.activity_status as enum ('programada', 'cancelada');
create type public.project_status as enum ('idea', 'en_curso', 'finalizado', 'cancelado');
create type public.recurrence_frequency as enum ('semanal', 'mensual_dia', 'mensual_semana');
create type public.edit_scope as enum ('solo_esta', 'esta_y_siguientes');

-- ---------- Proyectos ----------
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities (id) on delete cascade,
  name          text not null check (length(trim(name)) between 2 and 100),
  goal          text check (length(goal) <= 300),
  description   text check (length(description) <= 4000),
  start_date    date not null,
  end_date      date not null,
  status        public.project_status not null default 'idea',
  color_index   smallint not null default 0 check (color_index between 0 and 5),
  created_by    uuid not null references public.profiles (id),
  deleted_at    timestamptz,
  deleted_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index projects_community_idx on public.projects (community_id) where deleted_at is null;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_owners (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id),
  primary key (project_id, user_id)
);

-- ---------- Series (reglas de repetición) ----------
create table public.activity_series (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities (id) on delete cascade,
  frequency     public.recurrence_frequency not null,
  interval      smallint not null default 1 check (interval between 1 and 12),
  month_day     smallint check (month_day between 1 and 31),     -- mensual_dia
  month_week    smallint check (month_week between -1 and 5),    -- mensual_semana: 1..5, -1 = último
  weekday       smallint check (weekday between 0 and 6),        -- 0 = domingo
  until_date    date not null,
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now()
);

-- ---------- Actividades ----------
-- Cada repetición es una fila propia: así cada una tiene su asistencia y se puede editar sola.
create table public.activities (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities (id) on delete cascade,
  series_id     uuid references public.activity_series (id) on delete set null,
  project_id    uuid references public.projects (id) on delete set null,
  title         text not null check (length(trim(title)) between 2 and 100),
  description   text check (length(description) <= 4000),
  type          public.activity_type not null default 'reunion',
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  location      text check (length(location) <= 200),
  status        public.activity_status not null default 'programada',
  created_by    uuid not null references public.profiles (id),
  deleted_at    timestamptz,
  deleted_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '31 days')
);
create index activities_calendar_idx on public.activities (community_id, starts_at) where deleted_at is null;
create index activities_series_idx on public.activities (series_id, starts_at) where series_id is not null;
create index activities_project_idx on public.activities (project_id) where project_id is not null;
create trigger activities_updated_at before update on public.activities
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Permisos
-- =====================================================================
alter table public.projects        enable row level security;
alter table public.project_owners  enable row level security;
alter table public.activity_series enable row level security;
alter table public.activities      enable row level security;

revoke all on public.projects, public.project_owners, public.activity_series, public.activities from anon, authenticated;
grant select on public.projects, public.project_owners, public.activity_series, public.activities to authenticated;

-- ¿Puede crear contenido en esta comunidad? Rover o coordinador activo, y la comunidad aprobada.
create function public.can_create_in(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role(cid) in ('rover', 'coordinador'), false)
     and exists (select 1 from public.communities c where c.id = cid and c.status = 'activa')
$$;

-- Lo borrado solo lo ve quien lo borró/creó y los coordinadores (para la papelera).
create policy "actividades: miembros ven las de su comunidad"
  on public.activities for select to authenticated
  using (
    public.is_member(community_id)
    and (deleted_at is null or created_by = auth.uid() or public.is_coordinator(community_id))
  );

create policy "proyectos: miembros ven los de su comunidad"
  on public.projects for select to authenticated
  using (
    public.is_member(community_id)
    and (deleted_at is null or created_by = auth.uid() or public.is_coordinator(community_id))
  );

create policy "responsables: visibles si veo el proyecto"
  on public.project_owners for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and public.is_member(p.community_id)));

create policy "series: miembros ven las de su comunidad"
  on public.activity_series for select to authenticated
  using (public.is_member(community_id));

-- =====================================================================
-- Recurrencias
-- =====================================================================

-- Devuelve las fechas locales (sin hora) de cada repetición.
-- p_first: fecha local de la primera. Se incluyen fechas <= p_until. Máximo 120.
create function public.recurrence_dates(
  p_first date, p_until date, p_frequency public.recurrence_frequency,
  p_interval int, p_month_week int default null
) returns setof date
language plpgsql immutable set search_path = '' as $$
declare
  d date;
  n int := 0;
  k int := 0;
  m date;            -- primer día del mes candidato
  dow int := extract(dow from p_first);
  day_of_month int := extract(day from p_first);
  candidate date;
begin
  if p_until < p_first then return; end if;

  if p_frequency = 'semanal' then
    d := p_first;
    while d <= p_until and n < 120 loop
      return next d; n := n + 1;
      d := d + 7 * p_interval;
    end loop;
    return;
  end if;

  -- Mensuales: recorremos meses de a p_interval.
  while n < 120 loop
    m := (date_trunc('month', p_first::timestamp) + make_interval(months => k * p_interval))::date;
    exit when m > p_until;
    candidate := null;

    if p_frequency = 'mensual_dia' then
      -- Si el mes no tiene ese día (ej. 31 de abril) se saltea.
      if day_of_month <= extract(day from (m + interval '1 month - 1 day')) then
        candidate := m + (day_of_month - 1);
      end if;
    else -- mensual_semana
      if p_month_week = -1 then
        -- Último <día de la semana> del mes.
        candidate := (m + interval '1 month - 1 day')::date;
        candidate := candidate - ((extract(dow from candidate)::int - dow + 7) % 7);
      else
        candidate := m + ((dow - extract(dow from m)::int + 7) % 7) + 7 * (p_month_week - 1);
        if extract(month from candidate) <> extract(month from m) then candidate := null; end if; -- no hay 5.º
      end if;
    end if;

    if candidate is not null and candidate >= p_first and candidate <= p_until then
      return next candidate; n := n + 1;
    end if;
    k := k + 1;
    exit when k > 240;
  end loop;
end $$;

-- =====================================================================
-- RPCs de actividades
-- =====================================================================

-- Crea una actividad o una serie. Devuelve el id de la primera.
-- p_recurrence (opcional): {"frequency": "semanal"|"mensual_dia"|"mensual_semana",
--                           "interval": 1..12, "until": "YYYY-MM-DD", "last": true|false}
--   * semanal: cada `interval` semanas, mismo día de la semana.
--   * mensual_dia: todos los meses el mismo número de día que la primera.
--   * mensual_semana: el mismo "N-ésimo día de la semana" que la primera (ej. 1.er sábado);
--     con "last": true, el último de ese día de la semana en el mes.
create function public.create_activity(
  p_community_id uuid, p_title text, p_type public.activity_type,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_description text default null, p_location text default null,
  p_project_id uuid default null, p_recurrence jsonb default null
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
    insert into public.activities (community_id, project_id, title, description, type, starts_at, ends_at, location, created_by)
    values (p_community_id, p_project_id, trim(p_title), nullif(trim(p_description), ''), p_type, p_starts_at, p_ends_at,
            nullif(trim(p_location), ''), uid)
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
    insert into public.activities (community_id, series_id, project_id, title, description, type, starts_at, ends_at, location, created_by)
    values (p_community_id, sid, p_project_id, trim(p_title), nullif(trim(p_description), ''), p_type,
            (d + local_start::time) at time zone tz,
            ((d + local_start::time) at time zone tz) + dur,
            nullif(trim(p_location), ''), uid)
    returning id into new_id;
    first_id := coalesce(first_id, new_id);
  end loop;

  if first_id is null then raise exception 'Con esa repetición no queda ninguna fecha. Revisá el día y la fecha “hasta”.'; end if;
  return first_id;
end $$;

-- Edita una actividad. En una serie, con scope 'esta_y_siguientes' los cambios de texto,
-- tipo, lugar, proyecto, horario y duración se aplican a esta y a las siguientes
-- (cada una conserva su fecha; esta toma además la fecha nueva).
create function public.update_activity(
  p_id uuid, p_title text, p_type public.activity_type,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_description text default null, p_location text default null,
  p_project_id uuid default null, p_scope public.edit_scope default 'solo_esta'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  a public.activities;
  tz text;
  new_time time;
  dur interval := p_ends_at - p_starts_at;
begin
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
         description = nullif(trim(p_description), ''), location = nullif(trim(p_location), ''), project_id = p_project_id
   where id = a.id;

  if p_scope = 'esta_y_siguientes' and a.series_id is not null then
    select timezone into tz from public.communities where id = a.community_id;
    new_time := (p_starts_at at time zone tz)::time;
    update public.activities x
       set title = trim(p_title), type = p_type,
           description = nullif(trim(p_description), ''), location = nullif(trim(p_location), ''), project_id = p_project_id,
           starts_at = ((x.starts_at at time zone tz)::date + new_time) at time zone tz,
           ends_at   = (((x.starts_at at time zone tz)::date + new_time) at time zone tz) + dur
     where x.series_id = a.series_id and x.id <> a.id and x.starts_at > a.starts_at
       and x.deleted_at is null and x.created_by = uid;
  end if;
end $$;

-- Cancela (queda visible como cancelada). Solo antes de que empiece.
create function public.cancel_activity(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); a public.activities;
begin
  select * into a from public.activities where id = p_id and deleted_at is null;
  if not found or a.created_by <> uid or not public.can_create_in(a.community_id) then
    raise exception 'Solo quien creó la actividad puede cancelarla.';
  end if;
  if a.starts_at <= now() then raise exception 'No se puede cancelar una actividad que ya empezó.'; end if;
  update public.activities set status = 'cancelada' where id = a.id;
end $$;

-- Mueve a la papelera. Devuelve cuántas actividades se borraron.
create function public.delete_activity(p_id uuid, p_scope public.edit_scope default 'solo_esta') returns int
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); a public.activities; n int;
begin
  select * into a from public.activities where id = p_id and deleted_at is null;
  if not found or a.created_by <> uid or not public.can_create_in(a.community_id) then
    raise exception 'Solo quien creó la actividad puede eliminarla.';
  end if;
  update public.activities x set deleted_at = now(), deleted_by = uid
   where x.deleted_at is null and x.created_by = uid
     and (x.id = a.id or (p_scope = 'esta_y_siguientes' and a.series_id is not null
                          and x.series_id = a.series_id and x.starts_at > a.starts_at));
  get diagnostics n = row_count;
  return n;
end $$;

-- Restaura desde la papelera: quien la creó o un coordinador, dentro de los 30 días.
create function public.restore_activity(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); a public.activities;
begin
  select * into a from public.activities where id = p_id and deleted_at is not null;
  if not found then raise exception 'No está en la papelera.'; end if;
  if not (a.created_by = uid or public.is_coordinator(a.community_id)) then
    raise exception 'Solo quien la creó o quien coordina puede restaurarla.';
  end if;
  update public.activities set deleted_at = null, deleted_by = null where id = a.id;
end $$;

-- =====================================================================
-- RPCs de proyectos
-- =====================================================================

-- Crea (p_id null) o edita un proyecto. Devuelve su id.
create function public.save_project(
  p_id uuid, p_community_id uuid, p_name text, p_start_date date, p_end_date date,
  p_status public.project_status, p_owner_ids uuid[],
  p_goal text default null, p_description text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  p public.projects;
  pid uuid;
  bad int;
begin
  if p_end_date < p_start_date then raise exception 'El fin tiene que ser igual o posterior al inicio.'; end if;
  if coalesce(array_length(p_owner_ids, 1), 0) = 0 then raise exception 'Elegí al menos un responsable.'; end if;

  if p_id is null then
    if not public.can_create_in(p_community_id) then raise exception 'No podés crear proyectos en esta comunidad.'; end if;
    pid := p_community_id; -- solo para validar responsables abajo
  else
    select * into p from public.projects where id = p_id and deleted_at is null;
    if not found then raise exception 'El proyecto no existe.'; end if;
    if not public.can_create_in(p.community_id)
       or not (p.created_by = uid or exists (select 1 from public.project_owners o where o.project_id = p.id and o.user_id = uid)) then
      raise exception 'Solo quien creó el proyecto o sus responsables pueden editarlo.';
    end if;
    pid := p.community_id;
  end if;

  -- Responsables: miembros activos de la comunidad, rovers o coordinadores.
  select count(*) into bad from unnest(p_owner_ids) as o(user_id)
  where not exists (
    select 1 from public.memberships m
    where m.community_id = pid and m.user_id = o.user_id and m.status = 'activo' and m.role in ('rover', 'coordinador')
  );
  if bad > 0 then raise exception 'Los responsables tienen que ser rovers activos de la comunidad.'; end if;

  if p_id is null then
    insert into public.projects (community_id, name, goal, description, start_date, end_date, status, color_index, created_by)
    values (p_community_id, trim(p_name), nullif(trim(p_goal), ''), nullif(trim(p_description), ''), p_start_date, p_end_date, p_status,
            coalesce((select min(c) from generate_series(0, 5) c
                      where c not in (select color_index from public.projects
                                      where community_id = p_community_id and deleted_at is null
                                        and status in ('idea', 'en_curso'))), 0),
            uid)
    returning id into pid;
  else
    update public.projects
       set name = trim(p_name), goal = nullif(trim(p_goal), ''), description = nullif(trim(p_description), ''),
           start_date = p_start_date, end_date = p_end_date, status = p_status
     where id = p_id;
    pid := p_id;
    delete from public.project_owners where project_id = pid;
  end if;

  insert into public.project_owners (project_id, user_id)
  select pid, x from (select distinct unnest(p_owner_ids) as x) s;
  return pid;
end $$;

create function public.delete_project(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); p public.projects;
begin
  select * into p from public.projects where id = p_id and deleted_at is null;
  if not found or p.created_by <> uid or not public.can_create_in(p.community_id) then
    raise exception 'Solo quien creó el proyecto puede eliminarlo.';
  end if;
  update public.projects set deleted_at = now(), deleted_by = uid where id = p.id;
end $$;

create function public.restore_project(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); p public.projects;
begin
  select * into p from public.projects where id = p_id and deleted_at is not null;
  if not found then raise exception 'No está en la papelera.'; end if;
  if not (p.created_by = uid or public.is_coordinator(p.community_id)) then
    raise exception 'Solo quien lo creó o quien coordina puede restaurarlo.';
  end if;
  update public.projects set deleted_at = null, deleted_by = null where id = p.id;
end $$;

-- =====================================================================
-- Rotación: transferir lo de alguien que se va
-- =====================================================================
create function public.transfer_ownership(p_community_id uuid, p_from uuid, p_to uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare n int; m int;
begin
  perform public.require_user();
  if not public.is_coordinator(p_community_id) then raise exception 'Solo quien coordina puede transferir.'; end if;
  if not exists (
    select 1 from public.memberships
    where community_id = p_community_id and user_id = p_to and status = 'activo' and role in ('rover', 'coordinador')
  ) then
    raise exception 'Solo se puede transferir a un rover activo de la comunidad.';
  end if;
  update public.activities set created_by = p_to where community_id = p_community_id and created_by = p_from;
  get diagnostics n = row_count;
  update public.projects set created_by = p_to where community_id = p_community_id and created_by = p_from;
  get diagnostics m = row_count;
  insert into public.project_owners (project_id, user_id)
  select o.project_id, p_to from public.project_owners o
  join public.projects p on p.id = o.project_id
  where p.community_id = p_community_id and o.user_id = p_from
  on conflict do nothing;
  delete from public.project_owners o using public.projects p
  where p.id = o.project_id and p.community_id = p_community_id and o.user_id = p_from;
  return n + m;
end $$;

-- =====================================================================
-- Papelera: borrado definitivo a los 30 días
-- =====================================================================
create function public.purge_trash() returns void
language sql security definer set search_path = '' as $$
  delete from public.activities where deleted_at < now() - interval '30 days';
  delete from public.projects   where deleted_at < now() - interval '30 days';
$$;

-- Programar la limpieza diaria si pg_cron está disponible (en Supabase sí; en tests locales no).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('fogon-vaciar-papelera', '30 6 * * *', 'select public.purge_trash()');
  end if;
end $$;

-- ---------- Permisos de ejecución ----------
revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.can_create_in(uuid),
  public.create_activity(uuid, text, public.activity_type, timestamptz, timestamptz, text, text, uuid, jsonb),
  public.update_activity(uuid, text, public.activity_type, timestamptz, timestamptz, text, text, uuid, public.edit_scope),
  public.cancel_activity(uuid), public.delete_activity(uuid, public.edit_scope), public.restore_activity(uuid),
  public.save_project(uuid, uuid, text, date, date, public.project_status, uuid[], text, text),
  public.delete_project(uuid), public.restore_project(uuid),
  public.transfer_ownership(uuid, uuid, uuid)
to authenticated;

revoke execute on function public.purge_trash(), public.recurrence_dates(date, date, public.recurrence_frequency, int, int)
from authenticated;
