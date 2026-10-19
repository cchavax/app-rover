// Fechas siempre en la zona horaria de la comunidad, no en la del celular.
// Sin librerías: Intl alcanza para lo que necesitamos.

export type Parts = { y: number; m: number; d: number; h: number; mi: number; dow: number };

const partsFmt = new Map<string, Intl.DateTimeFormat>();
function fmtFor(tz: string) {
  let f = partsFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23"
    });
    partsFmt.set(tz, f);
  }
  return f;
}
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Partes de una fecha vista en la zona horaria `tz`. */
export function partsIn(date: Date | string, tz: string): Parts {
  const out: Parts = { y: 0, m: 0, d: 0, h: 0, mi: 0, dow: 0 };
  for (const p of fmtFor(tz).formatToParts(typeof date === "string" ? new Date(date) : date)) {
    if (p.type === "year") out.y = Number(p.value);
    else if (p.type === "month") out.m = Number(p.value);
    else if (p.type === "day") out.d = Number(p.value);
    else if (p.type === "hour") out.h = Number(p.value) % 24;
    else if (p.type === "minute") out.mi = Number(p.value);
    else if (p.type === "weekday") out.dow = DOW[p.value] ?? 0;
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-24" del día en la zona `tz`. */
export function dayKey(date: Date | string, tz: string): string {
  const p = partsIn(date, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}
export const todayKey = (tz: string) => dayKey(new Date(), tz);

/** "15:00" en la zona `tz`. */
export function timeIn(date: Date | string, tz: string): string {
  const p = partsIn(date, tz);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** Convierte fecha + hora de pared en `tz` a un instante ISO (UTC). */
export function zonedToIso(dateKey: string, time: string, tz: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
  // Dos pasadas para cubrir cambios de horario.
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), tz);
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess += wall - seen;
  }
  return new Date(guess).toISOString();
}

/** Suma días a una clave "YYYY-MM-DD". */
export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Día de la semana (0 = domingo) de una clave "YYYY-MM-DD". */
export function dowOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

export function daysInMonthOfKey(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const weekdayName = (dow: number) => WEEKDAYS[dow] ?? "";
export const monthName = (m: number) => MONTHS[m - 1] ?? "";
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "sábado 24 de octubre" para una clave de día. */
export function longDay(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${weekdayName(dowOfKey(key))} ${d} de ${monthName(m ?? 1)}`;
}

/** "24 oct." */
export function shortDay(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${monthName(m ?? 1).slice(0, 3)}.`;
}

/** "Hoy", "Mañana" o "Sábado". */
export function relativeDay(key: string, today: string): string {
  if (key === today) return "Hoy";
  if (key === addDaysKey(today, 1)) return "Mañana";
  return cap(weekdayName(dowOfKey(key)));
}

/** Texto del rango de una actividad. */
export function rangeText(startIso: string, endIso: string, tz: string): string {
  const s = dayKey(startIso, tz), e = dayKey(endIso, tz);
  if (s === e) return `${cap(longDay(s))} · ${timeIn(startIso, tz)} a ${timeIn(endIso, tz)}`;
  return `${cap(longDay(s))} ${timeIn(startIso, tz)} → ${longDay(e)} ${timeIn(endIso, tz)}`;
}

/** Número de orden en español: 1.er, 2.º, 3.er, 4.º, 5.º */
export const ordinal = (n: number) => (n === 1 || n === 3 ? `${n}.er` : `${n}.º`);
