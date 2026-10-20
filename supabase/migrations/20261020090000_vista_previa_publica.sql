-- =====================================================================
-- Paso 5 · Vista previa al compartir por WhatsApp
-- Cuando se comparte el link de una actividad o proyecto, WhatsApp lee la
-- página sin sesión iniciada. Estas funciones devuelven SOLO lo necesario
-- para la tarjeta (título, fecha, lugar, comunidad), como se decidió en el plan.
-- Nada de miembros, respuestas, teléfonos ni descripciones.
-- =====================================================================

create function public.activity_preview(p_id uuid)
returns table (title text, type public.activity_type, starts_at timestamptz, ends_at timestamptz,
               location text, status public.activity_status, community text, timezone text)
language sql stable security definer set search_path = '' as $$
  select a.title, a.type, a.starts_at, a.ends_at, a.location, a.status, c.name, c.timezone
  from public.activities a
  join public.communities c on c.id = a.community_id and c.status = 'activa'
  where a.id = p_id and a.deleted_at is null
$$;

create function public.project_preview(p_id uuid)
returns table (name text, goal text, start_date date, end_date date, community text)
language sql stable security definer set search_path = '' as $$
  select p.name, p.goal, p.start_date, p.end_date, c.name
  from public.projects p
  join public.communities c on c.id = p.community_id and c.status = 'activa'
  where p.id = p_id and p.deleted_at is null
$$;

revoke execute on function public.activity_preview(uuid), public.project_preview(uuid) from public;
grant execute on function public.activity_preview(uuid), public.project_preview(uuid) to anon, authenticated;
