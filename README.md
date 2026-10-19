# Fogón

Fogón (nombre provisorio) es una app web (PWA) para organizar una Comunidad Rover de Scouts de Argentina: actividades, proyectos, asistencia y notificaciones. Pensada primero para el celular y para varias comunidades.

- Qué se construye y por qué: [`docs/PROMPT.md`](docs/PROMPT.md)
- Diseño técnico (modelo de datos, permisos, orden de trabajo): [`docs/PLAN.md`](docs/PLAN.md)

## Estado

| Paso | Contenido | Estado |
|---|---|---|
| 0 | Proyecto base, PWA instalable, deploy | En curso |
| 1 | Usuarios, comunidades, roles y permisos | Pendiente |
| 2 | Actividades (recurrentes), proyectos, papelera | Pendiente |
| 3 | Asistencia | Pendiente |
| 4 | Notificaciones push | Pendiente |
| 5 | Compartir por WhatsApp, lectura sin conexión | Pendiente |
| 6 | Ideas y métricas | Pendiente |

## Stack

React + TypeScript + Vite · Tailwind CSS · Supabase (Postgres, Auth, RLS, Edge Functions, pg_cron) · Vercel · vite-plugin-pwa

## Correr en local

Requisitos: Node 20 o superior.

```bash
npm install
cp .env.example .env.local   # completar con los datos de tu proyecto de Supabase
npm run dev
```

Para probar en el celular dentro de la misma red: `npm run dev -- --host` y abrir la IP que muestra la consola.

## Variables de entorno

| Variable | Dónde se consigue | ¿Secreta? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | No |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | No (la protege RLS) |
| `VITE_VAPID_PUBLIC_KEY` | Se genera en el paso 4 | No |

La `service_role` key y la clave privada VAPID **nunca** van en este repo ni en variables `VITE_`: se cargan solo como secretos de Supabase / Vercel.

## Deploy

1. En Vercel: **Add New → Project** e importar este repo. Vercel detecta Vite solo.
2. Cargar las variables de entorno de la tabla en **Settings → Environment Variables**.
3. Cada push a `main` despliega automáticamente.

## Licencia

MIT
