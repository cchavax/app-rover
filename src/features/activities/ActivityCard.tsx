import { Link } from "react-router";
import { useApp } from "../../app/context.tsx";
import { dayKey, shortDay, timeIn } from "../../lib/dates.ts";
import { TYPES, type Activity, type Project } from "../../lib/activities.ts";

export function ActivityCard({ a, project }: { a: Activity; project?: Project | undefined }) {
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
      {cancelled ? <span className="rounded-full bg-line/70 px-2.5 py-1 text-xs font-bold text-muted">Cancelada</span> : <span />}
    </Link>
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
