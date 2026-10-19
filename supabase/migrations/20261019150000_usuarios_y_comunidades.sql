-- =====================================================================
-- Paso 1 · Usuarios, comunidades y membresías
-- Ver docs/PLAN.md, secciones 2 y 3.
--
-- Principios:
--   * Toda la seguridad vive acá (RLS + permisos por columna + RPCs).
--   * Las membresías NO se escriben directo desde el cliente: solo por RPCs,
--     que validan quién puede hacer qué.
--   * Nunca se borra gente: se da de baja o se anonimiza.
-- =====================================================================

-- ---------- Tipos ----------
create type public.community_status as enum ('pendiente', 'activa', 'rechazada');
create type public.member_role as enum ('rover', 'coordinador', 'educador');
create type public.membership_status as enum ('pendiente', 'activo', 'rechazado', 'baja');

-- ---------- Utilidades ----------
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Código de invitación legible: sin 0/O ni 1/I/L para que no se confundan al dictarlo.
create function public.new_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    if i = 4 then code := code || '-'; end if;
  end loop;
  return code;
end $$;

-- ---------- Perfiles ----------
-- Un perfil por usuario de Auth. No usamos "on delete cascade": las cuentas
-- no se borran, se anonimizan (ver delete_my_account), así el historial no se rompe.
create table public.profiles (
  id                   uuid primary key references auth.users (id),
  full_name            text not null default '' check (length(full_name) <= 120),
  nickname             text check (length(nickname) <= 40),
  avatar_url           text,
  is_superadmin        boolean not null default false,
  privacy_accepted_at  timestamptz,
  anonymized_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- El teléfono va aparte para poder darle permisos más estrictos que al resto del perfil.
create table public.profile_contacts (
  user_id     uuid primary key references public.profiles (id),
  phone       text check (phone ~ '^[0-9 +()-]{6,25}$'),
  updated_at  timestamptz not null default now()
);
create trigger profile_contacts_updated_at before update on public.profile_contacts
  for each row execute function public.set_updated_at();

-- Al registrarse con Google se crea el perfil con nombre y foto.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  insert into public.profile_contacts (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Comunidades ----------
create table public.communities (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 2 and 80),
  scout_group  text not null check (length(trim(scout_group)) between 2 and 120),
  city         text not null check (length(trim(city)) between 2 and 80),
  timezone     text not null default 'America/Argentina/Cordoba',
  status       public.community_status not null default 'pendiente',
  invite_code  text not null unique default public.new_invite_code(),
  created_by   uuid not null references public.profiles (id),
  reviewed_by  uuid references public.profiles (id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger communities_updated_at before update on public.communities
  for each row execute function public.set_updated_at();

-- ---------- Membresías ----------
create table public.memberships (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities (id) on delete cascade,
  user_id       uuid not null references public.profiles (id),
  role          public.member_role not null default 'rover',
  status        public.membership_status not null default 'pendiente',
  requested_at  timestamptz not null default now(),
  joined_at     timestamptz,
  left_at       timestamptz,
  reviewed_by   uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (community_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id) where status = 'activo';
create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

-- ---------- Funciones auxiliares para las políticas ----------
-- security definer: leen memberships sin pasar por su propia RLS (evita recursión).
create function public.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_superadmin from public.profiles p where p.id = auth.uid()), false)
$$;

create function public.my_role(cid uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.community_id = cid and m.user_id = auth.uid() and m.status = 'activo'
$$;

create function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.my_role(cid) is not null
$$;

create function public.is_coordinator(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: sin membresía my_role() es NULL, y "NOT NULL" no frenaría un IF.
  select coalesce(public.my_role(cid) = 'coordinador', false)
$$;

-- ¿Comparto alguna comunidad con este usuario? (yo activo; el otro en cualquier estado,
-- así los coordinadores pueden ver quién pide entrar).
create function public.shares_community_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.community_id = mine.community_id
    where mine.user_id = auth.uid() and mine.status = 'activo' and theirs.user_id = other
  )
$$;

-- Igual, pero ambos activos: es la regla para ver el teléfono.
create function public.shares_active_community_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.community_id = mine.community_id
    where mine.user_id = auth.uid() and mine.status = 'activo'
      and theirs.user_id = other and theirs.status = 'activo'
  )
$$;

-- ---------- Regla: siempre al menos un coordinador activo ----------
create function public.ensure_coordinator_remains() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  others_active int;
  other_coords int;
begin
  if old.role = 'coordinador' and old.status = 'activo'
     and (new.role <> 'coordinador' or new.status <> 'activo') then
    select count(*) filter (where m.role = 'coordinador'), count(*)
      into other_coords, others_active
    from public.memberships m
    where m.community_id = old.community_id and m.status = 'activo' and m.id <> old.id;

    -- Si queda gente en la comunidad, alguien tiene que seguir coordinando.
    if others_active > 0 and other_coords = 0 then
      raise exception 'La comunidad tiene que tener al menos un coordinador. Nombrá a otro antes de dejar el rol.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger memberships_keep_coordinator before update on public.memberships
  for each row execute function public.ensure_coordinator_remains();

-- =====================================================================
-- Permisos
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.communities      enable row level security;
alter table public.memberships      enable row level security;

-- Nadie anónimo toca nada.
revoke all on public.profiles, public.profile_contacts, public.communities, public.memberships from anon;

-- Usuarios logueados: privilegios recortados por columna. El resto pasa por RPCs.
revoke all on public.profiles, public.profile_contacts, public.communities, public.memberships from authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, nickname, avatar_url, privacy_accepted_at) on public.profiles to authenticated;

grant select, update (phone) on public.profile_contacts to authenticated;

-- invite_code queda afuera a propósito: solo lo ven los coordinadores vía get_invite_code().
grant select (id, name, scout_group, city, timezone, status, created_by, reviewed_at, created_at, updated_at)
  on public.communities to authenticated;
grant update (name, scout_group, city, timezone) on public.communities to authenticated;

grant select on public.memberships to authenticated;

-- ---------- Políticas ----------
create policy "perfiles: me veo a mí y a mi comunidad"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_community_with(id) or public.is_superadmin());

create policy "perfiles: edito el mío"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "teléfono: yo y mi comunidad activa"
  on public.profile_contacts for select to authenticated
  using (user_id = auth.uid() or public.shares_active_community_with(user_id));

create policy "teléfono: edito el mío"
  on public.profile_contacts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "comunidades: veo las mías"
  on public.communities for select to authenticated
  -- Quien la pidió la ve mientras está pendiente gracias a su membresía de coordinador;
  -- si se va, deja de verla.
  using (public.is_member(id) or public.is_superadmin());

create policy "comunidades: coordinadores editan datos"
  on public.communities for update to authenticated
  using (public.is_coordinator(id)) with check (public.is_coordinator(id));

create policy "membresías: veo la mía y las de mi comunidad"
  on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_member(community_id) or public.is_superadmin());

-- =====================================================================
-- RPCs (lo que el cliente puede hacer sobre comunidades y membresías)
-- Todas son security definer y validan permisos adentro.
-- =====================================================================

create function public.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Tenés que iniciar sesión.' using errcode = '28000'; end if;
  return uid;
end $$;

-- Pedir una comunidad nueva. Queda pendiente hasta que la apruebe el superadmin.
-- Quien la pide queda como coordinador.
create function public.request_community(p_name text, p_scout_group text, p_city text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  cid uuid;
begin
  if (select count(*) from public.communities c where c.created_by = uid and c.status = 'pendiente') >= 2 then
    raise exception 'Ya tenés solicitudes de comunidad pendientes. Esperá a que se revisen.';
  end if;
  insert into public.communities (name, scout_group, city, created_by)
  values (trim(p_name), trim(p_scout_group), trim(p_city), uid)
  returning id into cid;
  insert into public.memberships (community_id, user_id, role, status, joined_at)
  values (cid, uid, 'coordinador', 'activo', now());
  return cid;
end $$;

-- Superadmin aprueba o rechaza una comunidad.
create function public.review_community(p_community_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  if not public.is_superadmin() then raise exception 'Solo el administrador de la plataforma puede aprobar comunidades.'; end if;
  update public.communities
     set status = case when p_approve then 'activa' else 'rechazada' end::public.community_status,
         reviewed_by = uid, reviewed_at = now()
   where id = p_community_id and status = 'pendiente';
  if not found then raise exception 'La comunidad no existe o ya fue revisada.'; end if;
end $$;

-- Unirse con código. Devuelve el estado de la membresía resultante.
create function public.join_community(p_code text)
returns public.membership_status
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  c   public.communities;
  m   public.memberships;
begin
  select * into c from public.communities
   where invite_code = upper(trim(p_code)) and status = 'activa';
  if not found then raise exception 'El código no es válido. Pedile uno nuevo a quien coordina tu comunidad.'; end if;

  select * into m from public.memberships where community_id = c.id and user_id = uid;
  if found then
    if m.status in ('activo', 'pendiente') then return m.status; end if;
    update public.memberships
       set status = 'pendiente', role = 'rover', requested_at = now(), left_at = null, reviewed_by = null
     where id = m.id;
    return 'pendiente';
  end if;

  insert into public.memberships (community_id, user_id) values (c.id, uid);
  return 'pendiente';
end $$;

-- Coordinador aprueba o rechaza a quien pidió entrar.
create function public.review_membership(p_membership_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  m public.memberships;
begin
  select * into m from public.memberships where id = p_membership_id;
  if not found or not public.is_coordinator(m.community_id) then
    raise exception 'Solo quien coordina la comunidad puede aprobar solicitudes.';
  end if;
  if m.status <> 'pendiente' then raise exception 'Esta solicitud ya fue revisada.'; end if;
  update public.memberships
     set status = case when p_approve then 'activo' else 'rechazado' end::public.membership_status,
         joined_at = case when p_approve then now() end,
         reviewed_by = uid
   where id = m.id;
end $$;

-- Coordinador cambia el rol de un miembro activo.
create function public.set_member_role(p_membership_id uuid, p_role public.member_role)
returns void
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  perform public.require_user();
  select * into m from public.memberships where id = p_membership_id;
  if not found or not public.is_coordinator(m.community_id) then
    raise exception 'Solo quien coordina la comunidad puede cambiar roles.';
  end if;
  if m.status <> 'activo' then raise exception 'Solo se puede cambiar el rol de miembros activos.'; end if;
  update public.memberships set role = p_role where id = m.id;
end $$;

-- Coordinador da de baja a un miembro (su historial se conserva).
create function public.remove_member(p_membership_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  perform public.require_user();
  select * into m from public.memberships where id = p_membership_id;
  if not found or not public.is_coordinator(m.community_id) then
    raise exception 'Solo quien coordina la comunidad puede dar de baja miembros.';
  end if;
  update public.memberships set status = 'baja', left_at = now() where id = m.id and status = 'activo';
end $$;

-- Salir de una comunidad.
create function public.leave_community(p_community_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  update public.memberships set status = 'baja', left_at = now()
   where community_id = p_community_id and user_id = uid and status in ('activo', 'pendiente');
end $$;

-- Ver y regenerar el código de invitación (solo coordinadores).
create function public.get_invite_code(p_community_id uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_user();
  if not public.is_coordinator(p_community_id) then
    raise exception 'Solo quien coordina la comunidad puede ver el código.';
  end if;
  return (select invite_code from public.communities where id = p_community_id);
end $$;

create function public.regenerate_invite_code(p_community_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare new_code text;
begin
  perform public.require_user();
  if not public.is_coordinator(p_community_id) then
    raise exception 'Solo quien coordina la comunidad puede cambiar el código.';
  end if;
  update public.communities set invite_code = public.new_invite_code()
   where id = p_community_id returning invite_code into new_code;
  return new_code;
end $$;

-- Borrar mi cuenta: anonimiza el perfil, borra el teléfono y me da de baja en todo.
-- Actividades, proyectos y asistencias quedan, a nombre de "Ex miembro".
-- (El usuario de Auth lo desactiva una Edge Function aparte.)
create function public.delete_my_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  -- Si soy el último coordinador de alguna comunidad con gente, el trigger lo frena.
  update public.memberships set status = 'baja', left_at = now()
   where user_id = uid and status in ('activo', 'pendiente');
  update public.profile_contacts set phone = null where user_id = uid;
  update public.profiles
     set full_name = 'Ex miembro', nickname = null, avatar_url = null, anonymized_at = now()
   where id = uid;
end $$;

-- ---------- Permisos de ejecución ----------
-- Por defecto Postgres deja ejecutar cualquier función a cualquiera: lo cerramos.
revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.is_superadmin(), public.my_role(uuid), public.is_member(uuid), public.is_coordinator(uuid),
  public.shares_community_with(uuid), public.shares_active_community_with(uuid),
  public.request_community(text, text, text), public.review_community(uuid, boolean),
  public.join_community(text), public.review_membership(uuid, boolean),
  public.set_member_role(uuid, public.member_role), public.remove_member(uuid),
  public.leave_community(uuid), public.get_invite_code(uuid), public.regenerate_invite_code(uuid),
  public.delete_my_account()
to authenticated;

-- Funciones internas: nadie las llama desde el cliente.
revoke execute on function
  public.handle_new_user(), public.ensure_coordinator_remains(), public.set_updated_at(),
  public.new_invite_code(), public.require_user()
from authenticated;
