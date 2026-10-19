-- =====================================================================
-- Paso 3 · Asistencia
--   * rsvps: lo que cada uno responde ANTES (voy / tal vez / no voy).
--   * attendance: quién fue de verdad, cargado DESPUÉS por quien creó la
--     actividad o un coordinador. Es la base de las progresiones futuras.
-- =====================================================================

create type public.rsvp_response as enum ('voy', 'talvez', 'no');

create table public.rsvps (
  activity_id  uuid not null references public.activities (id) on delete cascade,
  user_id      uuid not null references public.profiles (id),
  response     public.rsvp_response not null,
  updated_at   timestamptz not null default now(),
  primary key (activity_id, user_id)
);
create index rsvps_user_idx on public.rsvps (user_id);
create trigger rsvps_updated_at before update on public.rsvps
  for each row execute function public.set_updated_at();

create table public.attendance (
  activity_id  uuid not null references public.activities (id) on delete cascade,
  user_id      uuid not null references public.profiles (id),
  recorded_by  uuid not null references public.profiles (id),
  recorded_at  timestamptz not null default now(),
  primary key (activity_id, user_id)
);
create index attendance_user_idx on public.attendance (user_id);

-- Marca de "ya se tomó lista" (aunque no haya ido nadie, la lista queda tomada).
alter table public.activities add column attendance_taken_at timestamptz;

-- ---------- Permisos ----------
alter table public.rsvps      enable row level security;
alter table public.attendance enable row level security;
revoke all on public.rsvps, public.attendance from anon, authenticated;
grant select on public.rsvps, public.attendance to authenticated;

-- Comunidad de una actividad (para las políticas, sin pasar por la RLS de activities).
create function public.activity_community(aid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select community_id from public.activities where id = aid
$$;

create policy "respuestas: miembros de la comunidad"
  on public.rsvps for select to authenticated
  using (public.is_member(public.activity_community(activity_id)));

create policy "asistencia: miembros de la comunidad"
  on public.attendance for select to authenticated
  using (public.is_member(public.activity_community(activity_id)));

-- ---------- RPCs ----------

-- Responder (o borrar la respuesta con p_response = null). Cualquier miembro activo,
-- educadores incluidos, hasta que la actividad empieza.
create function public.set_rsvp(p_activity_id uuid, p_response public.rsvp_response)
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); a public.activities;
begin
  select * into a from public.activities where id = p_activity_id and deleted_at is null;
  if not found or not public.is_member(a.community_id) then raise exception 'La actividad no existe.'; end if;
  if a.status = 'cancelada' then raise exception 'La actividad está cancelada.'; end if;
  if a.starts_at <= now() then raise exception 'La actividad ya empezó: ya no se puede cambiar la respuesta.'; end if;

  if p_response is null then
    delete from public.rsvps where activity_id = a.id and user_id = uid;
  else
    insert into public.rsvps (activity_id, user_id, response) values (a.id, uid, p_response)
    on conflict (activity_id, user_id) do update set response = excluded.response;
  end if;
end $$;

-- Tomar lista: reemplaza la asistencia real de una actividad que ya terminó.
create function public.save_attendance(p_activity_id uuid, p_user_ids uuid[])
returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  a public.activities;
  bad int;
  n int;
begin
  select * into a from public.activities where id = p_activity_id and deleted_at is null;
  if not found or not public.is_member(a.community_id) then raise exception 'La actividad no existe.'; end if;
  if not ((a.created_by = uid and public.can_create_in(a.community_id)) or public.is_coordinator(a.community_id)) then
    raise exception 'Solo quien creó la actividad o quien coordina puede tomar lista.';
  end if;
  if a.status = 'cancelada' then raise exception 'La actividad está cancelada.'; end if;
  if a.ends_at > now() then raise exception 'La lista se toma cuando la actividad termina.'; end if;

  select count(*) into bad from unnest(coalesce(p_user_ids, '{}')) as x(user_id)
  where not exists (
    select 1 from public.memberships m
    where m.community_id = a.community_id and m.user_id = x.user_id and m.status = 'activo'
  );
  if bad > 0 then raise exception 'En la lista solo puede haber miembros activos de la comunidad.'; end if;

  delete from public.attendance where activity_id = a.id;
  insert into public.attendance (activity_id, user_id, recorded_by)
  select a.id, x, uid from (select distinct unnest(coalesce(p_user_ids, '{}')) as x) s;
  get diagnostics n = row_count;
  update public.activities set attendance_taken_at = now() where id = a.id;
  return n;
end $$;

-- ---------- Permisos de ejecución ----------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.activity_community(uuid),
  public.set_rsvp(uuid, public.rsvp_response),
  public.save_attendance(uuid, uuid[])
to authenticated;
