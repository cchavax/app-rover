import { useState } from "react";
import { Link } from "react-router";
import { useApp, useMemberNames } from "../../app/context.tsx";
import { ErrorBox, Loading } from "../../components/ui.tsx";
import { PROJECT_STATUS, projectColor, useProjects, type Project } from "../../lib/activities.ts";
import { shortDay, todayKey } from "../../lib/dates.ts";
import { errorMessage } from "../../lib/supabase.ts";
import { Fab } from "../activities/ActivityCard.tsx";

/** Avance estimado según las fechas del proyecto. */
function progress(p: Project, today: string): number {
  if (p.status === "finalizado") return 100;
  const s = Date.parse(p.start_date), e = Date.parse(p.end_date), n = Date.parse(today);
  if (e <= s) return n >= e ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((n - s) / (e - s)) * 100)));
}

export function ProjectsScreen() {
  const { community, canCreate, tz } = useApp();
  const { name } = useMemberNames();
  const projects = useProjects(community.id);
  const [tab, setTab] = useState<"activos" | "cerrados">("activos");
  const today = todayKey(tz);

  if (projects.isLoading) return <Loading />;
  if (projects.error && !projects.data) return <ErrorBox message={errorMessage(projects.error)} onRetry={() => void projects.refetch()} />;

  const list = (projects.data ?? []).filter((p) =>
    tab === "activos" ? p.status === "idea" || p.status === "en_curso" : p.status === "finalizado" || p.status === "cancelado"
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {(["activos", "cerrados"] as const).map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${tab === t ? "border-ink bg-ink text-bg" : "border-line bg-surface"}`}
          >
            {t === "activos" ? "Activos" : "Finalizados"}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="py-8 text-center text-muted">
          {tab === "activos" ? (canCreate ? "No hay proyectos todavía. Creá el primero con el botón +." : "No hay proyectos activos.") : "Ningún proyecto finalizado."}
        </p>
      ) : null}
      {list.map((p) => (
        <Link
          key={p.id}
          to={`/proyectos/${p.id}`}
          className="block rounded-2xl border border-line border-l-[5px] bg-surface p-3.5"
          style={{ borderLeftColor: projectColor(p.color_index) }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 font-display text-lg font-extrabold leading-tight">{p.name}</span>
            <span className="flex-none rounded-full bg-line/60 px-2.5 py-1 text-xs font-bold text-muted">{PROJECT_STATUS[p.status]}</span>
          </div>
          <p className="mt-1 text-[13.5px] text-muted">
            {p.owners.map((o) => name(o.user_id)).join(", ")} · {shortDay(p.start_date)} → {shortDay(p.end_date)}
          </p>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded bg-line/60" aria-label="Avance según fechas">
            <i className="block h-full" style={{ width: `${progress(p, today)}%`, background: projectColor(p.color_index) }} />
          </div>
        </Link>
      ))}
      {canCreate ? <Fab to="/proyectos/nuevo" label="Proyecto" /> : null}
    </div>
  );
}
