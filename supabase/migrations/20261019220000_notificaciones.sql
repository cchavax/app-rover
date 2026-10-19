-- =====================================================================
-- Paso 4 · Notificaciones push
--
-- Cómo funciona:
--   1. Cada dispositivo que activa notificaciones guarda su suscripción.
--   2. Los eventos (actividad nueva, cambio, cancelación, solicitud) y los
--      recordatorios meten mensajes en notification_queue, ya filtrados por
--      las preferencias de cada uno.
--   3. pg_cron corre private.dispatch() cada minuto: agrega recordatorios y,
--      si hay algo pendiente, llama a la Edge Function "push", que cifra y
--      envía a cada dispositivo.
-- =====================================================================

create type public.notification_kind as enum ('nueva', 'confirmar', 'manana', 'cambio', 'cancelacion', 'solicitud', 'prueba');

-- ---------- Esquema privado (no expuesto por la API) ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.settings (
  key   text primary key,
  value text not null
);

create table private.push_keys (
  id           int primary key default 1 check (id = 1),
  public_key   text not null,
  private_jwk  jsonb not null,
  created_at   timestamptz not null default now()
);

-- ---------- Suscripciones (una por dispositivo) ----------
create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id),
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------- Preferencias (sin fila = todo activado) ----------
create table public.notification_prefs (
  user_id      uuid primary key references public.profiles (id),
  nueva        boolean not null default true,
  confirmar    boolean not null default true,
  manana       boolean not null default true,
  cambios      boolean not null default true,
  solicitudes  boolean not null default true,
  updated_at   timestamptz not null default now()
);
create trigger notification_prefs_updated_at before update on public.notification_prefs
  for each row execute function public.set_updated_at();

-- ---------- Cola de mensajes ----------
create table public.notification_queue (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id),
  kind          public.notification_kind not null,
  activity_id   uuid references public.activities (id) on delete cascade,
  community_id  uuid references public.communities (id) on delete cascade,
  title         text not null,
  body          text not null,
  url           text not null default '/',
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  sent_at       timestamptz
);
create index notification_queue_pending_idx on public.notification_queue (id) where sent_at is null;
-- Un recordatorio de cada tipo por persona y actividad, nunca dos.
create unique index notification_queue_reminder_once
  on public.notification_queue (user_id, activity_id, kind) where kind in ('confirmar', 'manana');

-- ---------- Permisos ----------
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notification_queue enable row level security;
revoke all on public.push_subscriptions, public.notification_prefs, public.notification_queue from anon, authenticated;
grant select on public.push_subscriptions, public.notification_prefs to authenticated;

create policy "suscripciones: las mías" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "preferencias: las mías" on public.notification_prefs for select to authenticated using (user_id = auth.uid());
-- La cola no la lee ningún usuario: solo el servidor (service_role, que saltea RLS).

-- =====================================================================
-- Funciones internas
-- =====================================================================

-- "sáb 24/10 15:00" en la zona de la comunidad.
create function private.fmt_when(ts timestamptz, tz text) returns text
language sql immutable set search_path = '' as $$
  select (array['dom','lun','mar','mié','jue','vie','sáb'])[extract(dow from ts at time zone tz)::int + 1]
         || ' ' || to_char(ts at time zone tz, 'DD/MM HH24:MI')
$$;

-- ¿Quiere este tipo de aviso? (sin preferencias guardadas = sí)
create function private.wants(uid uuid, k public.notification_kind) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((
    select case k
      when 'nueva' then p.nueva
      when 'confirmar' then p.confirmar
      when 'manana' then p.manana
      when 'cambio' then p.cambios
      when 'cancelacion' then p.cambios
      when 'solicitud' then p.solicitudes
      else true end
    from public.notification_prefs p where p.user_id = uid
  ), true)
$$;

-- Avisar a quienes dijeron "voy" o "tal vez" (salvo a quien hizo el cambio).
-- Para series: un solo aviso pendiente por persona y serie, aunque se toquen varias fechas.
create function private.notify_attendees(a public.activities, k public.notification_kind, t text, b text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification_queue (user_id, kind, activity_id, community_id, title, body, url)
  select r.user_id, k, a.id, a.community_id, t, b, '/actividades/' || a.id
  from public.rsvps r
  where r.activity_id = a.id and r.response in ('voy', 'talvez')
    and r.user_id is distinct from auth.uid()
    and private.wants(r.user_id, k)
    and not exists (
      select 1 from public.notification_queue q
      join public.activities x on x.id = q.activity_id
      where q.user_id = r.user_id and q.kind = k and q.sent_at is null
        and (q.activity_id = a.id or (a.series_id is not null and x.series_id = a.series_id))
    );
end $$;

-- ---------- Triggers de eventos ----------
create function private.on_activity_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tz text;
begin
  -- En una serie, solo avisamos por la primera fecha.
  if new.series_id is not null and exists (
    select 1 from public.activities where series_id = new.series_id and id <> new.id
  ) then
    return new;
  end if;
  if new.starts_at <= now() then return new; end if;
  select timezone into tz from public.communities where id = new.community_id;

  insert into public.notification_queue (user_id, kind, activity_id, community_id, title, body, url)
  select m.user_id, 'nueva', new.id, new.community_id,
         'Nueva actividad: ' || new.title,
         private.fmt_when(new.starts_at, tz)
           || coalesce(' · ' || new.location, '')
           || case when new.series_id is not null then ' (se repite)' else '' end
           || '. ¿Vas?',
         '/actividades/' || new.id
  from public.memberships m
  where m.community_id = new.community_id and m.status = 'activo'
    and m.user_id <> new.created_by
    and private.wants(m.user_id, 'nueva');
  return new;
end $$;
create trigger activities_notify_insert after insert on public.activities
  for each row execute function private.on_activity_insert();

create function private.on_activity_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tz text;
begin
  if new.starts_at <= now() then return new; end if;
  select timezone into tz from public.communities where id = new.community_id;

  if old.status = 'programada' and new.status = 'cancelada' then
    perform private.notify_attendees(new, 'cancelacion', 'Se canceló: ' || new.title,
      'Era el ' || private.fmt_when(new.starts_at, tz) || '.');
  elsif old.deleted_at is null and new.deleted_at is not null and new.status = 'programada' then
    perform private.notify_attendees(new, 'cancelacion', 'Se canceló: ' || new.title,
      'Era el ' || private.fmt_when(new.starts_at, tz) || '.');
  elsif new.deleted_at is null and new.status = 'programada'
        and (new.starts_at <> old.starts_at or new.ends_at <> old.ends_at or new.location is distinct from old.location) then
    perform private.notify_attendees(new, 'cambio', 'Cambió: ' || new.title,
      'Ahora: ' || private.fmt_when(new.starts_at, tz) || coalesce(' · ' || new.location, '') || '.');
  end if;
  return new;
end $$;
create trigger activities_notify_update after update on public.activities
  for each row execute function private.on_activity_update();

create function private.on_membership_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  if new.status <> 'pendiente' or (tg_op = 'UPDATE' and old.status = 'pendiente') then return new; end if;
  select coalesce(nullif(nickname, ''), full_name) into who from public.profiles where id = new.user_id;
  insert into public.notification_queue (user_id, kind, community_id, title, body, url)
  select m.user_id, 'solicitud', new.community_id, 'Solicitud para unirse',
         coalesce(who, 'Alguien') || ' quiere sumarse a la comunidad.', '/comunidad'
  from public.memberships m
  where m.community_id = new.community_id and m.status = 'activo' and m.role = 'coordinador'
    and private.wants(m.user_id, 'solicitud');
  return new;
end $$;
create trigger memberships_notify_request after insert or update of status on public.memberships
  for each row execute function private.on_membership_request();

-- ---------- Recordatorios ----------
-- A partir de las 19 h (hora de la comunidad):
--   * "confirmar": actividades de pasado mañana a las que todavía no respondiste.
--   * "manana": actividades de mañana a las que dijiste que vas.
-- p_now existe para poder probarlo con fechas fijas.
create function private.enqueue_reminders(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare n1 int; n2 int;
begin
  insert into public.notification_queue (user_id, kind, activity_id, community_id, title, body, url)
  select m.user_id, 'confirmar', a.id, a.community_id,
         '¿Vas a ' || a.title || '?',
         initcap(private.fmt_when(a.starts_at, c.timezone)) || coalesce(' · ' || a.location, '') || '. Tocá para confirmar.',
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
         to_char(a.starts_at at time zone c.timezone, 'HH24:MI') || ' h' || coalesce(' · ' || a.location, '') || '.',
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

  -- Limpieza: lo enviado hace más de 30 días.
  delete from public.notification_queue where sent_at < p_now - interval '30 days';
  return n1 + n2;
end $$;

-- ---------- Disparador del envío (lo corre pg_cron cada minuto) ----------
create function private.dispatch() returns void
language plpgsql security definer set search_path = '' as $$
declare url text; secret text;
begin
  perform private.enqueue_reminders();
  if not exists (
    select 1 from public.notification_queue
    where sent_at is null and (claimed_at is null or claimed_at < now() - interval '5 minutes')
  ) then
    return;
  end if;
  select value into url from private.settings where key = 'functions_url';
  select value into secret from private.settings where key = 'cron_secret';
  if url is null or secret is null then return; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using url, '{"action":"process"}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-fogon-secret', secret);
end $$;

-- Configuración inicial (se corre una vez desde el SQL Editor).
create function private.configure_push(p_functions_url text, p_site_url text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.settings values ('functions_url', p_functions_url)
    on conflict (key) do update set value = excluded.value;
  insert into private.settings values ('site_url', p_site_url)
    on conflict (key) do update set value = excluded.value;
  insert into private.settings values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
    on conflict (key) do nothing;
  return 'Listo: notificaciones configuradas.';
end $$;

-- =====================================================================
-- RPCs para la app
-- =====================================================================
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  if p_endpoint !~ '^https://' then raise exception 'Suscripción inválida.'; end if;
  -- Si el dispositivo estaba asociado a otra cuenta, pasa a la actual.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end $$;

create function public.delete_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = public.require_user();
end $$;

create function public.set_notification_prefs(p_prefs jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  insert into public.notification_prefs (user_id) values (uid) on conflict do nothing;
  update public.notification_prefs set
    nueva       = coalesce((p_prefs ->> 'nueva')::boolean, nueva),
    confirmar   = coalesce((p_prefs ->> 'confirmar')::boolean, confirmar),
    manana      = coalesce((p_prefs ->> 'manana')::boolean, manana),
    cambios     = coalesce((p_prefs ->> 'cambios')::boolean, cambios),
    solicitudes = coalesce((p_prefs ->> 'solicitudes')::boolean, solicitudes)
  where user_id = uid;
end $$;

-- Mandarme una notificación de prueba.
create function public.send_test_push() returns int
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); n int;
begin
  select count(*) into n from public.push_subscriptions where user_id = uid;
  if n = 0 then raise exception 'Este dispositivo todavía no tiene las notificaciones activadas.'; end if;
  insert into public.notification_queue (user_id, kind, title, body, url)
  values (uid, 'prueba', 'Fogón funciona', 'Así te van a llegar los avisos de tu comunidad.', '/');
  return n;
end $$;

-- =====================================================================
-- RPCs para el servidor (Edge Function, con service_role)
-- =====================================================================
create function public.push_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'public_key', (select public_key from private.push_keys),
    'private_jwk', (select private_jwk from private.push_keys),
    'subject', (select value from private.settings where key = 'site_url'),
    'secret', (select value from private.settings where key = 'cron_secret')
  )
$$;

create function public.push_save_keys(p_public_key text, p_private_jwk jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into private.push_keys (id, public_key, private_jwk) values (1, p_public_key, p_private_jwk)
  on conflict (id) do nothing
$$;

-- Toma un lote de mensajes pendientes con las suscripciones de cada destinatario.
create function public.push_claim_batch(p_limit int default 200)
returns table (queue_id bigint, title text, body text, url text, tag text, subs jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with claimed as (
    update public.notification_queue q set claimed_at = now()
    where q.id in (
      select p.id from public.notification_queue p
      where p.sent_at is null and (p.claimed_at is null or p.claimed_at < now() - interval '5 minutes')
      order by p.id limit p_limit
      for update skip locked
    )
    returning q.id, q.user_id, q.kind, q.activity_id, q.title, q.body, q.url
  )
  select c.id, c.title, c.body, c.url,
         c.kind::text || coalesce(':' || c.activity_id::text, ''),
         coalesce((
           select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
           from public.push_subscriptions s where s.user_id = c.user_id
         ), '[]'::jsonb)
  from claimed c;
end $$;

-- Marca enviados y borra los dispositivos que ya no existen.
create function public.push_finish(p_sent bigint[], p_dead_endpoints text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_queue set sent_at = now() where id = any(p_sent);
  delete from public.push_subscriptions where endpoint = any(p_dead_endpoints);
end $$;

-- =====================================================================
-- Permisos de ejecución
-- =====================================================================
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text),
  public.set_notification_prefs(jsonb), public.send_test_push()
to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema private to service_role;
    grant execute on function public.push_config(), public.push_save_keys(text, jsonb),
      public.push_claim_batch(int), public.push_finish(bigint[], text[]) to service_role;
  end if;
end $$;
revoke execute on function public.push_config(), public.push_save_keys(text, jsonb),
  public.push_claim_batch(int), public.push_finish(bigint[], text[]) from authenticated;

-- ---------- Programación (solo si las extensiones existen: en Supabase sí) ----------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('fogon-notificaciones', '* * * * *', 'select private.dispatch()');
  end if;
end $$;
