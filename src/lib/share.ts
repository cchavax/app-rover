import type { Activity, Project, Series } from "./activities.ts";
import { seriesText, TYPES } from "./activities.ts";
import { cap, dayKey, longDay, timeIn } from "./dates.ts";
import { coordsOf, directionsUrl } from "./maps.ts";

/** Mensaje para difundir una actividad por WhatsApp (usa el formato *negrita* de WhatsApp). */
export function activityMessage(
  a: Activity,
  tz: string,
  extra: { series?: Series | undefined; project?: Project | undefined; going?: number | undefined; appUrl: string }
): string {
  const start = dayKey(a.starts_at, tz), end = dayKey(a.ends_at, tz);
  const when =
    start === end
      ? `${cap(longDay(start))} · ${timeIn(a.starts_at, tz)} a ${timeIn(a.ends_at, tz)} h`
      : `Del ${longDay(start)} (${timeIn(a.starts_at, tz)} h) al ${longDay(end)} (${timeIn(a.ends_at, tz)} h)`;
  const lines: (string | null)[] = [
    `🔥 *${a.title}*`,
    `_${TYPES[a.type].label}${extra.project ? ` · ${extra.project.name}` : ""}_`,
    "",
    `📅 ${when}`,
    extra.series ? `🔁 ${seriesText(extra.series)}` : null,
    a.location ? `📍 ${a.location}` : null,
    coordsOf(a) ? `🗺️ Cómo llegar: ${directionsUrl(a.location, coordsOf(a))}` : null,
    a.description ? `\n${a.description.length > 280 ? a.description.slice(0, 277).trimEnd() + "…" : a.description}` : null,
    "",
    extra.going ? `🙋 Ya ${extra.going === 1 ? "va 1" : `van ${extra.going}`}.` : null,
    `👉 Confirmá si vas en Fogón: ${extra.appUrl}`
  ];
  return lines.filter((l) => l !== null).join("\n").replace(/\n{3,}/g, "\n\n");
}

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
