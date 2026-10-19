# Plan técnico — App Comunidad Rover (MVP)

Estado: **borrador para aprobar**. Nada de esto está implementado todavía.

## 1. Arquitectura

```
Celular (PWA React)  ──►  Supabase
  │  service worker          ├─ Postgres + RLS  (todos los permisos viven acá)
  │  (push + offline)        ├─ Auth (Google)
  │                          ├─ Edge Functions  (envío de push)
  ▼                          └─ pg_cron         (recordatorios, limpieza de papelera)
Vercel
  ├─ sitio estático (la PWA)
  └─ función /a/:id y /p/:id  (vista previa para WhatsApp)
```

- La PWA habla directo con Supabase usando la clave pública (anon). La seguridad depende 100 % de RLS.
- La clave `service_role` solo vive en Edge Functions y en la función de Vercel, nunca en el frontend.

## 2. Modelo de datos

Convenciones: `uuid` como PK, `timestamptz` para fechas con hora, `created_at`/`updated_at` en todo, borrado lógico con `deleted_at` + `deleted_by`.

### Enums
| Enum | Valores |
|---|---|
| `community_status` | pendiente, activa, rechazada |
| `member_role` | rover, coordinador, educador |
| `membership_status` | pendiente, activo, rechazado, baja |
| `activity_type` | reunion, campamento, servicio, salida, otro |
| `activity_status` | programada, cancelada |
| `project_status` | idea, en_curso, finalizado, cancelado |
| `rsvp_response` | voy, talvez, no |
| `idea_status` | propuesta, planificada, en_desarrollo, lanzada, descartada |
| `notification_kind` | nueva_actividad, confirmar, recordatorio_dia_antes, cambio, cancelacion, solicitud_ingreso |

### Tablas

**Usuarios y comunidades**
- `profiles` — `id` (= `auth.users.id`), `full_name`, `nickname`, `avatar_url`, `phone`, `is_superadmin`, `anonymized_at`
- `communities` — `id`, `name`, `scout_group`, `city`, `timezone` (default `America/Argentina/Cordoba`), `status`, `invite_code` (único), `created_by`
- `memberships` — `id`, `community_id`, `user_id`, `role`, `status`, `joined_at`, `left_at` · único (`community_id`, `user_id`)

**Calendario**
- `projects` — `id`, `community_id`, `name`, `goal`, `description`, `start_date`, `end_date`, `status`, `color_index`, `created_by`, `deleted_at`, `deleted_by` · check `end_date >= start_date`
- `project_owners` — (`project_id`, `user_id`) PK
- `activity_series` — `id`, `community_id`, `interval_days` (7 o 14), `until_date`, `created_by`
- `activities` — `id`, `community_id`, `series_id?`, `project_id?`, `title`, `description`, `type`, `starts_at`, `ends_at`, `location`, `status`, `created_by`, `deleted_at`, `deleted_by` · check `ends_at > starts_at`

**Asistencia**
- `rsvps` — (`activity_id`, `user_id`) PK, `response`, `updated_at`
- `attendance` — (`activity_id`, `user_id`) PK, `recorded_by`, `recorded_at`

**Notificaciones**
- `push_subscriptions` — `id`, `user_id`, `endpoint` (único), `p256dh`, `auth`, `user_agent`, `last_used_at`
- `notification_prefs` — `user_id` PK, un booleano por tipo de notificación
- `notification_log` — `user_id`, `activity_id`, `kind`, `sent_at` · único (`user_id`, `activity_id`, `kind`) para no mandar dos veces el mismo recordatorio

**Ideas y métricas**
- `ideas` — `id`, `title`, `description`, `status`
- `idea_votes` — (`idea_id`, `user_id`) PK, `community_id` (copia al votar, para desglosar)
- `suggestions` — `id`, `user_id`, `community_id`, `text`, `converted_idea_id?`
- `user_active_days` — (`user_id`, `community_id`, `day`) PK · se registra una fila por día de uso → usuarios activos por semana sin herramientas externas

### Decisiones de modelado
- **Recurrentes materializadas:** cada reunión de una serie es una fila real en `activities` (hasta `until_date`, máximo 1 año). Así cada una tiene su propia asistencia, y "editar solo esta" es un update común. "Esta y las siguientes" = update por `series_id` y `starts_at >= X`.
- **Rol por comunidad** en `memberships`; `is_superadmin` es global en `profiles`.
- **Nunca borrar personas de verdad:** al salir de la comunidad, `memberships.status = baja`. Al borrar la cuenta se anonimiza el perfil (nombre → "Ex miembro", se borra el teléfono y la foto) y se conservan actividades y asistencias.

## 3. Permisos (RLS)

Funciones auxiliares (`security definer`, `stable`): `is_member(community_id)`, `my_role(community_id)`, `is_coordinator(community_id)`, `is_superadmin()`.

| Tabla | Ver | Crear | Editar | Borrar |
|---|---|---|---|---|
| communities | miembros activos; superadmin | vía RPC `request_community` | coordinador; superadmin (estado) | — |
| memberships | miembros activos de esa comunidad; el propio usuario | vía RPC `join_community(code)` | coordinador (rol/estado) | — |
| profiles | uno mismo + miembros de comunidades en común (teléfono solo a miembros activos) | trigger al registrarse | uno mismo | RPC `delete_my_account` |
| projects | miembros activos | rover/coordinador | creador o responsable | soft delete: creador; restaurar: creador o coordinador |
| activities | miembros activos | rover/coordinador | creador | soft delete: creador; restaurar: creador o coordinador |
| rsvps | miembros activos | uno mismo, solo antes de `starts_at` | ídem | ídem |
| attendance | miembros activos | creador de la actividad o coordinador, después de `ends_at` | ídem | ídem |
| ideas | todos los logueados | superadmin | superadmin | superadmin |
| idea_votes | todos los logueados (conteo) | uno mismo | — | uno mismo |
| suggestions | autor; superadmin | cualquiera logueado | superadmin | — |
| push_subscriptions / notification_prefs | uno mismo | uno mismo | uno mismo | uno mismo |

El **educador** no aparece en ninguna columna de crear/editar salvo `rsvps`.

Reglas que no entran en una policy y van como **trigger o RPC**:
- No dejar a una comunidad sin coordinador activo (trigger en `memberships`).
- Quien crea la comunidad queda como coordinador (RPC `request_community`).
- `transfer_ownership(from_user, to_user, community)`: solo coordinador.
- Bloquear el cambio de `rsvps` después de `starts_at` (trigger, además de la policy).
- Limpieza de papelera: pg_cron diario borra definitivamente lo que tiene `deleted_at` de más de 30 días.

## 4. Notificaciones

- **Disparo inmediato** (nueva actividad, cambio, cancelación, solicitud de ingreso): trigger en Postgres → `pg_net` llama a la Edge Function `send-push` con el id del evento.
- **Recordatorios** (confirmar asistencia, día anterior): pg_cron cada hora llama a `send-reminders`, que busca a quién le corresponde y usa `notification_log` para no repetir.
- `send-push` filtra por `notification_prefs`, envía con Web Push (VAPID) a todas las suscripciones del usuario y borra las que devuelven 404/410 (dispositivo dado de baja).
- En el frontend: `vite-plugin-pwa` en modo `injectManifest` para tener un service worker propio que maneje `push` y `notificationclick` (abre `/actividades/:id`).

## 5. Frontend

**Librerías:** React Router, TanStack Query (con persistencia en IndexedDB para leer sin conexión), react-hook-form + zod, date-fns + date-fns-tz (locale `es`), Tailwind, vite-plugin-pwa.

**Estructura**
```
src/
  app/            rutas, layout, providers
  features/
    auth/         login, onboarding (unirse / crear comunidad)
    community/    miembros, invitaciones, solicitudes
    activities/   próximas, calendario, detalle, formulario, asistencia
    projects/     lista, detalle, formulario
    ideas/        tablero, sugerencias
    profile/      perfil, notificaciones, privacidad, papelera
    admin/        superadmin: comunidades pendientes, ideas, métricas
  lib/            supabase client, tipos generados, fechas, permisos
  sw.ts           service worker (push + caché)
supabase/
  migrations/     SQL versionado
  functions/      send-push, send-reminders
  tests/          pgTAP (RLS)
  seed.sql
api/              funciones de Vercel (vista previa WhatsApp)
```

**Pantallas** (las mismas del prototipo, más las que faltan)
1. Login con Google + consentimiento de privacidad
2. Onboarding: unirme con código / solicitar comunidad nueva / "esperando aprobación"
3. Próximas · Calendario · Proyectos · Ideas · Perfil (pestañas)
4. Detalle de actividad, formulario de actividad, tomar lista
5. Detalle de proyecto, formulario de proyecto
6. Comunidad (miembros, roles, código, solicitudes) · Papelera
7. Superadmin: comunidades pendientes, gestión de ideas y sugerencias, métricas

## 6. Pruebas
- **RLS (pgTAP):** por cada rol, qué puede y qué no; que una comunidad no ve nada de otra; educador sin escritura; asistencia bloqueada después del inicio; último coordinador.
- **Unitarias (Vitest):** generación de recurrentes, permisos en UI, fechas y zonas horarias.
- **Seed:** 2 comunidades, todos los roles, un superadmin, series recurrentes, proyectos, respuestas y listas tomadas.

## 7. Orden de trabajo
| Paso | Entregable | Se prueba |
|---|---|---|
| 0 | Repo, Vite + Tailwind + PWA, deploy en Vercel con pantalla vacía | Abrir el link en el celu e instalarla |
| 1 | Migraciones de usuarios/comunidades + RLS + tests + login y onboarding | Entrar con Google, unirse con código, aprobar |
| 2 | Actividades (con recurrentes), proyectos, papelera | Crear/editar/borrar desde el celu |
| 3 | Asistencia y tomar lista | Responder desde dos cuentas |
| 4 | Notificaciones push | Que llegue al celu con la app cerrada |
| 5 | Compartir por WhatsApp + lectura offline | Mandar un link al grupo; modo avión |
| 6 | Ideas, sugerencias y métricas | Votar; ver el panel |

## 8. A definir con vos
1. **Vista previa de WhatsApp:** muestra título, fecha y lugar a cualquiera que tenga el link, aunque no esté logueado. ¿Está bien, o preferís que diga solo "Actividad de [comunidad]"?
2. **Recurrentes:** ¿alcanza con semanal y quincenal, o hace falta "el primer sábado de cada mes"?
3. **Dominio:** ¿arrancamos con el de Vercel (`algo.vercel.app`) o vas a comprar uno? Se puede cambiar después.
4. **Nombre de la app:** hace falta para el ícono y el instalador.
