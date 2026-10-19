# Contexto
Soy desarrollador (React + TypeScript + PostgreSQL) y voy a construir una app
web para Comunidades Rover (Scouts de Argentina). Arranca con mi comunidad
(~15 personas), pero la idea es ofrecerla a otras comunidades, así que debe
ser multi-comunidad desde el inicio: cada comunidad ve solo sus datos.

La visión final incluye actividades, proyectos y progresiones personales,
pero la vamos a construir UNA funcionalidad a la vez y validarla con la
comunidad antes de seguir. Cada funcionalidad tiene que salir completa y
pulida, no a medias.

Esta primera etapa (MVP) incluye SOLO lo descrito en este documento. No
implementes nada fuera de este alcance (progresiones, finanzas, chat, etc.),
pero diseñá el modelo de datos para que sea fácil sumarlo después.

# Stack
- Frontend: React + TypeScript + Vite, Tailwind CSS
- Backend/DB: Supabase (PostgreSQL + Auth + Row Level Security + Edge Functions + pg_cron)
- Deploy: Vercel (frontend) + Supabase free tier
- PWA instalable y mobile-first: la mayoría la usa desde el celular.
- Idioma de la interfaz: español (Argentina). Fechas y horas en formato
  local y zona horaria America/Argentina/Cordoba.

# Funcionalidad 1: Usuarios y comunidades
- Login con Google (Supabase Auth).
- Entidad `comunidad` (nombre, grupo scout, ciudad).
- Alta de comunidades nuevas: cualquiera puede solicitarla, pero queda
  pendiente hasta que la apruebe el superadmin (yo).
- Un usuario se une a una comunidad mediante un link/código de invitación y
  queda "pendiente" hasta que un coordinador lo aprueba.
- El rol es POR COMUNIDAD (tabla de membresías usuario–comunidad–rol), no
  global, porque un educador podría acompañar a más de una comunidad.
- Roles dentro de una comunidad:
  - `rover`: crea actividades y proyectos; edita y elimina solo los suyos
    (en proyectos, también los responsables pueden editar).
  - `coordinador`: es un rover con permisos extra para gestionar la
    comunidad: aprobar/rechazar miembros, asignar roles, regenerar el código
    de invitación, transferir la propiedad de actividades y proyectos.
    Quien crea la comunidad es coordinador inicial.
  - `educador`: supervisor/observador. Ve todo lo de su comunidad y puede
    confirmar asistencia, pero NO crea, edita ni elimina contenido.
- Rol global `superadmin` (plataforma, separado de los roles de comunidad):
  aprueba comunidades, gestiona el tablero de ideas y ve las métricas.
  No ve el contenido interno de las comunidades salvo lo necesario para métricas agregadas.
- Perfil: nombre, apodo, foto (de Google), teléfono opcional.
- Todos los permisos se aplican con políticas RLS en la base de datos,
  incluido el aislamiento entre comunidades. No confiar solo en el frontend.

## Rotación de miembros
Los rovers egresan de la rama, así que la gente rota seguido:
- Un miembro puede salir de la comunidad o ser dado de baja; sus
  actividades, proyectos y asistencias históricas se conservan.
- Un coordinador puede transferir la propiedad de actividades y proyectos
  de un miembro a otro.
- Una comunidad siempre debe tener al menos un coordinador activo (impedir
  que el último se quite el rol o se vaya sin designar a otro).
- Borrado lógico (soft delete) de actividades y proyectos, con papelera
  donde el creador o un coordinador puede restaurarlos durante 30 días.

## Privacidad
- El teléfono solo es visible para miembros aprobados de la misma comunidad.
- El usuario puede eliminar su cuenta y sus datos personales (anonimizar
  su nombre en el historial en vez de romper los registros).
- Tener en cuenta la Ley 25.326 de Protección de Datos Personales:
  texto breve de privacidad y consentimiento en el registro.

# Funcionalidad 2: Calendario (actividades y proyectos)
Actividad:
- título, descripción, tipo (reunión, campamento, servicio, salida, otro),
  fecha/hora de inicio y fin, lugar, proyecto asociado (opcional),
  creada por, comunidad, estado (programada / cancelada).
- Actividades recurrentes: repetir semanal o quincenalmente con fecha de fin.
  Al editar o eliminar, elegir "solo esta" o "esta y las siguientes".

Proyecto:
- nombre, descripción, objetivo, fecha de inicio y fin estimada,
  estado (idea, en curso, finalizado, cancelado), responsables (varios rovers),
  creado por, comunidad.
- Un proyecto puede tener muchas actividades.

Vistas:
- Vista lista "próximas actividades" (pantalla principal en celular)
  + calendario mensual.
- Los proyectos se ven como franjas en el calendario.
- Detalle de actividad y de proyecto (con sus actividades).
- Formularios de alta/edición con validación; borrado con confirmación.
- Los botones de editar/eliminar solo aparecen si el usuario tiene permiso.

Compartir:
- Botón "Compartir por WhatsApp" en cada actividad y proyecto, que envía un
  link a su detalle.
- El link debe mostrar vista previa en WhatsApp (título, fecha, lugar)
  mediante meta tags Open Graph generados del lado del servidor (la SPA sola
  no alcanza: usar una función de Vercel o Supabase para servir los meta tags).
- Si quien abre el link no está logueado o no es de la comunidad, ve solo
  la vista previa y la invitación a ingresar, nunca los datos internos.

Sin conexión:
- La app debe permitir LEER el calendario y el detalle de las próximas
  actividades sin conexión (pensado para campamentos sin señal), mostrando
  cuándo fue la última sincronización. Crear o editar sin conexión no es necesario.

# Funcionalidad 3: Asistencia
Confirmación (antes):
- En cada actividad, cada miembro marca: voy / no voy / tal vez
  (puede cambiarlo hasta que empiece la actividad).
- El detalle muestra el conteo y la lista de quién va, quién no y quién
  no respondió.
- En la lista de próximas actividades, mostrar un indicador de las que
  todavía no respondí.

Asistencia real (después):
- Una vez terminada la actividad, su creador o un coordinador puede tomar
  lista: quién asistió realmente (precargada con los que dijeron "voy").
- Guardar este historial: se va a usar más adelante para progresiones personales.

# Funcionalidad 4: Notificaciones push (parte central del MVP)
Las notificaciones son esenciales: la app no se considera lista para
lanzar sin ellas. Contemplalas desde el diseño inicial (modelo de datos,
PWA y service worker desde el primer paso), aunque el envío se implemente
después del CRUD y la asistencia.
- Web Push con service worker y claves VAPID; guardar las suscripciones
  por usuario y dispositivo (un usuario puede tener varios).
- Envío desde una Supabase Edge Function; recordatorios programados con pg_cron.
- Notificaciones:
  - Nueva actividad creada en mi comunidad.
  - Recordatorio de confirmar asistencia si no respondí (ej. 2 días antes).
  - Recordatorio el día anterior a una actividad a la que dije "voy".
  - Cambio de fecha/lugar o cancelación de una actividad a la que dije "voy".
  - Para coordinadores: nueva solicitud para unirse a la comunidad.
- El usuario puede activar/desactivar cada tipo desde su perfil.
- En iPhone las push solo funcionan con la app instalada en la pantalla
  de inicio: detectar iOS sin instalar y mostrar instrucciones para instalarla.
- Pedir permiso de notificaciones con un botón explícito, nunca al abrir la app.
- Al tocar una notificación, abrir directo el detalle de esa actividad.

# Funcionalidad 5: Tablero de ideas y métricas
Tablero de ideas (global, compartido por todas las comunidades):
- El superadmin publica propuestas de funcionalidades: título, descripción,
  estado (propuesta, planificada, en desarrollo, lanzada, descartada).
- Cada usuario puede votar una propuesta (un voto por usuario, puede quitarlo)
  y ver el ranking.
- Cualquier usuario puede enviar una sugerencia libre; solo la ve el
  superadmin, que puede convertirla en propuesta.
- El superadmin puede ver los votos desglosados por comunidad.

Métricas (solo superadmin):
- Panel simple con: usuarios activos por semana, actividades creadas,
  porcentaje de respuesta a la confirmación de asistencia, y suscripciones
  activas a notificaciones, por comunidad y en total.
- Calcularlo con consultas propias sobre la base (sin herramientas de
  analítica de terceros); si hace falta, una tabla de eventos mínima.

# Orden de construcción
0. Setup: proyecto Vite + Tailwind + PWA (manifest y service worker),
   Supabase local, deploy en Vercel funcionando con una pantalla vacía.
1. Auth, comunidades, membresías, roles y RLS, con sus tests.
2. CRUD de actividades (incluidas recurrentes) y proyectos, papelera.
3. Asistencia: confirmación y asistencia real.
4. Notificaciones push.
5. Compartir por WhatsApp y lectura sin conexión.
6. Tablero de ideas y métricas.

# Cómo quiero que trabajes
1. Antes de escribir código, proponé un plan: modelo de datos (tablas,
   relaciones, enums), políticas RLS, estructura de carpetas y lista de
   pantallas. Esperá mi aprobación.
2. Usá migraciones SQL versionadas de Supabase, nada creado a mano desde el panel.
3. Incluí un seed con 2 comunidades, usuarios de cada rol (incluido un
   superadmin), actividades (algunas recurrentes), proyectos y asistencias,
   para probar el aislamiento y los permisos.
4. Escribí tests de las políticas RLS (qué puede y qué no puede hacer
   cada rol, y que una comunidad no ve datos de otra).
5. Avanzá en pasos chicos y verificables siguiendo el orden de construcción;
   al terminar cada paso decime qué probar y hacé un commit con mensaje claro.
6. Tipado estricto en TypeScript (tipos generados desde el esquema de Supabase).
7. README con: cómo correrlo local, variables de entorno (incluidas las
   claves VAPID) y cómo deployar.
8. Si algo de este pedido es ambiguo, preguntame en vez de suponer.
