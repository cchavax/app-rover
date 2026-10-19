-- =====================================================================
-- Sede de cada comunidad: lugar por defecto para las actividades.
-- La carga un coordinador; la ven todos los miembros.
-- =====================================================================
alter table public.communities
  add column home_name text check (length(home_name) <= 200),
  add column home_lat double precision check (home_lat between -90 and 90),
  add column home_lng double precision check (home_lng between -180 and 180),
  add constraint communities_home_pair check ((home_lat is null) = (home_lng is null));

-- Los permisos de communities son por columna (paso 1): sumamos las nuevas.
grant select (home_name, home_lat, home_lng) on public.communities to authenticated;
grant update (home_name, home_lat, home_lng) on public.communities to authenticated;
-- La política "comunidades: coordinadores editan datos" ya limita quién puede actualizar.
