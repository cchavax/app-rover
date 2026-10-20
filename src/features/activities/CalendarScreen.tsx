import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useApp } from "../../app/context.tsx";
import { ErrorBox } from "../../components/ui.tsx";
import { TYPES, projectColor, useActivitiesInRange, useProjects, type Activity } from "../../lib/activities.ts";
import { addDaysKey, cap, dayKey, dowOfKey, longDay, monthName, todayKey, zonedToIso } from "../../lib/dates.ts";
import { errorMessage } from "../../lib/supabase.ts";
import { ActivityCard, Fab } from "./ActivityCard.tsx";

const WD = ["L", "M", "M", "J", "V", "S", "D"];

export function CalendarScreen() {
  const { community, tz, canCreate } = useApp();
  const today = todayKey(tz);
  const [month, setMonth] = useState(today.slice(0, 7)); // "YYYY-MM"
  const [selected, setSelected] = useState(today);

  const first = `${month}-01`;
  const gridStart = addDaysKey(first, -((dowOfKey(first) + 6) % 7)); // la grilla arranca el lunes
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => addDaysKey(gridStart, i)), [gridStart]);
  const lastCell = cells[41] ?? gridStart;

  const acts = useActivitiesInRange(community.id, zonedToIso(gridStart, "00:00", tz), zonedToIso(addDaysKey(lastCell, 1), "00:00", tz));
  const projects = useProjects(community.id);
  const activeProjects = (projects.data ?? []).filter((p) => p.status === "idea" || p.status === "en_curso");

  const byDay = useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const a of acts.data ?? []) {
      let k = dayKey(a.starts_at, tz);
      const end = dayKey(a.ends_at, tz);
      for (let i = 0; i < 32 && k <= end; i++, k = addDaysKey(k, 1)) {
        const list = m.get(k) ?? [];
        list.push(a);
        m.set(k, list);
      }
    }
    return m;
  }, [acts.data, tz]);

  const [y, mo] = month.split("-").map(Number);
  const move = (n: number) => {
    const d = new Date(Date.UTC(y ?? 2026, (mo ?? 1) - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const selectedActs = byDay.get(selected) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button onClick={() => move(-1)} aria-label="Mes anterior" className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-xl">‹</button>
        <h2 className="flex-1 text-center font-display text-xl font-extrabold">
          {cap(monthName(mo ?? 1))} {y}
        </h2>
        <button onClick={() => move(1)} aria-label="Mes siguiente" className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-xl">›</button>
      </div>

      {acts.error && !acts.data ? <ErrorBox message={errorMessage(acts.error)} onRetry={() => void acts.refetch()} /> : null}

      <div className="grid grid-cols-7 gap-[3px]">
        {WD.map((d, i) => (
          <div key={i} className="pb-0.5 text-center text-[11.5px] font-bold text-muted">{d}</div>
        ))}
        {cells.map((k) => {
          const list = byDay.get(k) ?? [];
          const bands = activeProjects.filter((p) => p.start_date <= k && p.end_date >= k).slice(0, 3);
          const isSel = k === selected;
          return (
            <button
              key={k}
              onClick={() => setSelected(k)}
              aria-pressed={isSel}
              aria-label={`${longDay(k)}, ${list.length} actividades`}
              className={`flex min-h-[58px] min-w-0 flex-col items-center gap-[3px] rounded-[10px] border bg-surface px-[3px] pb-[3px] pt-1 text-sm tabular-nums ${
                isSel ? "border-accent ring-1 ring-accent" : "border-transparent"
              } ${k.slice(0, 7) !== month ? "opacity-40" : ""}`}
            >
              <span className={k === today ? "rounded-lg bg-ink px-1.5 font-bold text-bg" : ""}>{Number(k.slice(8))}</span>
              <span className="flex min-h-[6px] gap-[3px]">
                {list.slice(0, 3).map((a) => (
                  <i key={a.id} className="h-1.5 w-1.5 rounded-full" style={{ background: a.status === "cancelada" ? "var(--color-muted)" : TYPES[a.type].color }} />
                ))}
              </span>
              <span className="mt-auto flex w-full flex-col gap-0.5">
                {bands.map((p) => (
                  <i key={p.id} className="block h-1 rounded-sm" style={{ background: projectColor(p.color_index) }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {activeProjects.length ? (
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-muted">
          {activeProjects.map((p) => (
            <Link key={p.id} to={`/proyectos/${p.id}`} className="inline-flex items-center gap-1.5">
              <i className="h-1 w-4 rounded-sm" style={{ background: projectColor(p.color_index) }} />
              {p.name}
            </Link>
          ))}
        </div>
      ) : null}

      <h2 className="mx-0.5 mt-2 font-display text-[17px] font-extrabold">{cap(longDay(selected))}</h2>
      {selectedActs.length ? (
        selectedActs.map((a) => <ActivityCard key={a.id} a={a} />)
      ) : (
        <p className="py-4 text-center text-muted">Nada este día.</p>
      )}
      {canCreate ? <Fab to={`/actividades/nueva?fecha=${selected}`} label="Actividad" /> : null}
    </div>
  );
}
