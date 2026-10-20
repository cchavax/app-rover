// Vista previa para WhatsApp (y cualquier app que muestre tarjetas de links).
// /a/:id y /p/:id llegan acá (ver vercel.json): devolvemos una página mínima con
// las etiquetas Open Graph y redirigimos a la app. WhatsApp lee las etiquetas;
// las personas pasan directo a la actividad.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPE = { reunion: "Reunión", campamento: "Campamento", servicio: "Servicio", salida: "Salida", otro: "Actividad" };

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function when(startIso, endIso, tz) {
  const day = (d) => new Intl.DateTimeFormat("es-AR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(d));
  const time = (d) => new Intl.DateTimeFormat("es-AR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const sameDay = day(startIso) === day(endIso);
  return sameDay ? `${cap(day(startIso))}, ${time(startIso)} a ${time(endIso)} h` : `Del ${day(startIso)} al ${day(endIso)}`;
}

async function rpc(fn, id) {
  if (!SUPABASE_URL || !ANON_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_id: id })
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const kind = url.searchParams.get("t") === "p" ? "p" : "a";
  const id = url.searchParams.get("id") ?? "";
  const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const target = UUID.test(id) ? (kind === "p" ? `/proyectos/${id}` : `/actividades/${id}`) : "/";

  let title = "Fogón";
  let description = "La agenda de tu Comunidad Rover: actividades, proyectos y quién va.";
  if (UUID.test(id)) {
    if (kind === "a") {
      const a = await rpc("activity_preview", id);
      if (a) {
        title = a.status === "cancelada" ? `Suspendida: ${a.title}` : a.title;
        description = [`${TYPE[a.type] ?? "Actividad"} · ${when(a.starts_at, a.ends_at, a.timezone)}`, a.location, `${a.community} · Confirmá si vas en Fogón`]
          .filter(Boolean)
          .join(" · ");
      }
    } else {
      const p = await rpc("project_preview", id);
      if (p) {
        title = p.name;
        description = [p.goal, `Proyecto de ${p.community}`].filter(Boolean).join(" · ");
      }
    }
  }

  const html = `<!doctype html>
<html lang="es-AR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Fogón</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Fogón">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(origin + url.pathname)}">
<meta property="og:image" content="${esc(origin)}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<link rel="canonical" href="${esc(origin + target)}">
</head><body style="font-family:system-ui,sans-serif;background:#101412;color:#e7ece9;padding:24px">
<p>Abriendo <a style="color:#f0675b" href="${esc(target)}">${esc(title)}</a> en Fogón…</p>
<script>location.replace(${JSON.stringify(target)})</script>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // WhatsApp guarda la tarjeta un tiempo; cacheamos 5 min para que un cambio se vea pronto.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  res.statusCode = 200;
  res.end(html);
}
