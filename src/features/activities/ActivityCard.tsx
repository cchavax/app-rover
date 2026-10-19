import { Link } from "react-router";
import { useApp } from "../../app/context.tsx";
import { dayKey, shortDay, timeIn } from "../../lib/dates.ts";
import { TYPES, type Activity, type Project } from "../../lib/activities.ts";
import { RSVP_LABEL, type Rsvp } from "../../lib/attendance.ts";

const PILL: Record<Rsvp, string> = {
  voy: "bg-[var(--ok-soft)] text-[var(--ok)]",
  talvez: "bg-[var(--warn-soft)] text-[var(--warn)]",
  no: "bg-line/70 text-muted"
};

/** Tarjeta de actividad. Con `showRsvp`, muestra mi respuesta o "Responder". */
export function ActivityCard({ a, project, rsvp, showRsvp = false }: { a: Activity; project?: Project | undefined; rsvp?: Rsvp | undefined; showRsvp?: boolean }) {
  const { tz } = useApp();
  const t = TYPES[a.type];
  const multiDay = dayKey(a.starts_at, tz) !== dayKey(a.ends_at, tz);
  const cancelled = a.status === "cancelada";
  return (
    <Link
      to={`/actividades/${a.id}`}
      className="grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3"
    >
      <div className="border-r-[3px] pr-2.5 leading-tight tabular-nums" style={{ borderColor: cancelled ? "var(--color-line)" : t.color }}>
        <div className="text-[15px] font-bold">{timeIn(a.starts_at, tz)}</div>
        <div className="text-xs text-muted">{multiDay ? shortDay(dayKey(a.ends_at, tz)) : timeIn(a.ends_at, tz)}</div>
      </div>
      <div className="min-w-0">
        <div className={`font-bold leading-snug ${cancelled ? "text-muted line-through" : ""}`}>{a.title}</div>
        <div className="truncate text-[13.5px] text-muted">
          {t.label}
          {a.location ? ` · ${a.location}` : ""}
        </div>
        {project ? <span className="mt-1 inline-block rounded-md bg-line/60 px-2 py-0.5 text-[12.5px]">{project.name}</span> : null}
      </div>
      <StatusPill cancelled={cancelled} started={Date.parse(a.starts_at) <= Date.now()} rsvp={rsvp} showRsvp={showRsvp} />
    </Link>
  );
}

function StatusPill({ cancelled, started, rsvp, showRsvp }: { cancelled: boolean; started: boolean; rsvp: Rsvp | undefined; showRsvp: boolean }) {
  const base = "whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold";
  if (cancelled) return <span className={`${base} bg-line/70 text-muted`}>Cancelada</span>;
  if (!showRsvp) return <span />;
  if (rsvp) return <span className={`${base} ${PILL[rsvp]}`}>{RSVP_LABEL[rsvp]}</span>;
  if (started) return <span className={`${base} bg-line/70 text-muted`}>En curso</span>;
  return (
    <span className={`${base} inline-flex items-center gap-1.5 bg-accent-soft text-accent`}>
      <i className="h-1.5 w-1.5 rounded-full bg-accent" />
      Responder
    </span>
  );
}

export function Fab({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="fixed z-30 flex h-14 items-center gap-2 rounded-2xl bg-accent pl-4 pr-5 font-bold text-white shadow-lg"
      style={{ right: "max(16px, calc((100vw - 576px) / 2 + 16px))", bottom: "calc(76px + env(safe-area-inset-bottom))" }}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      {label}
    </Link>
  );
}

export function BackLink({ to = -1 as const, label = "Volver" }: { to?: string | -1; label?: string }) {
  return to === -1 ? (
    <button onClick={() => window.history.back()} className="flex items-center gap-1 self-start py-1 text-[15px] font-bold text-accent">
      ‹ {label}
    </button>
  ) : (
    <Link to={to} className="flex items-center gap-1 self-start py-1 text-[15px] font-bold text-accent">
      ‹ {label}
    </Link>
  );
}
