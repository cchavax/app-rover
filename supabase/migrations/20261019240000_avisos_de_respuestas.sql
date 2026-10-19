-- =====================================================================
-- Avisar a quien creó una actividad cuando alguien se suma, se baja o cambia.
-- Los avisos pendientes de la misma actividad se agrupan en uno solo.
-- =====================================================================

alter type public.notification_kind add value if not exists 'respuesta';

alter table public.notification_prefs add column respuestas boolean not null default true;
alter table public.notification_queue add column group_count int not null default 1;

-- plpgsql (y no sql) a propósito: así el valor nuevo del enum se evalúa al ejecutar,
-- no al crear la función (Postgres no deja usarlo en la misma transacción).
create or replace function private.wants(uid uuid, k public.notification_kind) returns boolean
language plpgsql stable set search_path = '' as $$
declare p public.notification_prefs;
begin
  select * into p from public.notification_prefs where user_id = uid;
  if not found then return true; end if;
  return case k::text
    when 'nueva' then p.nueva
    when 'confirmar' then p.confirmar
    when 'manana' then p.manana
    when 'cambio' then p.cambios
    when 'cancelacion' then p.cambios
    when 'solicitud' then p.solicitudes
    when 'respuesta' then p.respuestas
    else true end;
end $$;

create or replace function public.set_notification_prefs(p_prefs jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  insert into public.notification_prefs (user_id) values (uid) on conflict do nothing;
  update public.notification_prefs set
    nueva       = coalesce((p_prefs ->> 'nueva')::boolean, nueva),
    confirmar   = coalesce((p_prefs ->> 'confirmar')::boolean, confirmar),
    manana      = coalesce((p_prefs ->> 'manana')::boolean, manana),
    cambios     = coalesce((p_prefs ->> 'cambios')::boolean, cambios),
    solicitudes = coalesce((p_prefs ->> 'solicitudes')::boolean, solicitudes),
    respuestas  = coalesce((p_prefs ->> 'respuestas')::boolean, respuestas)
  where user_id = uid;
end $$;

create function private.on_rsvp_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a public.activities;
  who_id uuid := coalesce(new.user_id, old.user_id);
  who text;
  before_r text := case when tg_op = 'INSERT' then null else old.response::text end;
  after_r text := case when tg_op = 'DELETE' then null else new.response::text end;
  what text;
  going int;
  pending public.notification_queue;
  k_resp public.notification_kind := 'respuesta'::text::public.notification_kind;
begin
  if before_r is not distinct from after_r then return null; end if;
  select * into a from public.activities where id = coalesce(new.activity_id, old.activity_id);
  if not found or a.deleted_at is not null or a.status = 'cancelada' or a.starts_at <= now() then return null; end if;
  if a.created_by = who_id then return null; end if;
  if not private.wants(a.created_by, k_resp) then return null; end if;
  if not exists (
    select 1 from public.memberships m
    where m.community_id = a.community_id and m.user_id = a.created_by and m.status = 'activo'
  ) then
    return null;
  end if;

  what := case
    when after_r = 'voy' then 'se sumó'
    when after_r = 'talvez' and before_r = 'voy' then 'ya no está seguro de ir'
    when after_r = 'talvez' then 'tal vez va'
    when after_r = 'no' and before_r in ('voy', 'talvez') then 'se bajó'
    when after_r = 'no' then 'no puede ir'
    when after_r is null and before_r = 'voy' then 'se bajó'
    else null end;
  if what is null then return null; end if;

  select coalesce(nullif(nickname, ''), split_part(full_name, ' ', 1)) into who from public.profiles where id = who_id;
  select count(*) into going from public.rsvps where activity_id = a.id and response = 'voy';
  what := coalesce(who, 'Alguien') || ' ' || what;

  -- ¿Ya hay un aviso de respuestas sin enviar para esta actividad? Lo actualizamos.
  select * into pending from public.notification_queue q
  where q.user_id = a.created_by and q.activity_id = a.id and q.kind = k_resp
    and q.sent_at is null and q.claimed_at is null
  order by q.id desc limit 1
  for update;

  if found then
    update public.notification_queue
       set group_count = pending.group_count + 1,
           body = what || ' y hubo ' || pending.group_count
                  || case when pending.group_count = 1 then ' respuesta más' else ' respuestas más' end
                  || '. ' || case when going = 1 then 'Va 1.' when going = 0 then 'Todavía no va nadie.' else 'Ya van ' || going || '.' end,
           created_at = now()
     where id = pending.id;
  else
    insert into public.notification_queue (user_id, kind, activity_id, community_id, title, body, url)
    values (a.created_by, k_resp, a.id, a.community_id, a.title,
            what || '. ' || case when going = 1 then 'Va 1.' when going = 0 then 'Todavía no va nadie.' else 'Ya van ' || going || '.' end,
            '/actividades/' || a.id);
  end if;
  return null;
end $$;

create trigger rsvps_notify_creator after insert or update or delete on public.rsvps
  for each row execute function private.on_rsvp_change();

revoke execute on all functions in schema private from public, anon, authenticated;
