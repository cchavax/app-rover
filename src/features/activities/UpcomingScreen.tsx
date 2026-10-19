import { useMemo } from "react";
import { useApp } from "../../app/context.tsx";
import { Card, ErrorBox, Loading } from "../../components/ui.tsx";
import { useActivitiesInRange, useProjects, type Activity } from "../../lib/activities.ts";
import { addDaysKey, dayKey, relativeDay, shortDay, todayKey, zonedToIso } from "../../lib/dates.ts";
import { errorMessage } from "../../lib/supabase.ts";
import { ActivityCard, Fab } from "./ActivityCard.tsx";

const DAYS_AHEAD = 70;

export function UpcomingScreen() {
  const { community, canCreate, tz, profile } = useApp();
  const today = todayKey(tz);
  // Rango fijo por día para que la consulta se cachee bien.
  const from = useMemo(() => new Date().toISOString().slice(0, 13) + ":00:00Z", []);
  const to = zonedToIso(addDaysKey(today, DAYS_AHEAD), "00:00", tz);
  const acts = useActivitiesInRange(community.id, from, to);
  const projects = useProjects(community.id);
  const projById = new Map((projects.data ?? []).map((p) => [p.id, p]));

  const groups = useMemo(() => {
    const out: { key: string; items: Activity[] }[] = [];
    for (const a of acts.data ?? []) {
      const k = dayKey(a.starts_at, tz) < today ? today : dayKey(a.starts_at, tz); // las que ya empezaron van en "Hoy"
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(a);
      else out.push({ key: k, items: [a] });
    }
    return out;
  }, [acts.data, tz, today]);

  if (acts.isLoading) return <Loading />;
  if (acts.error) return <ErrorBox message={errorMessage(acts.error)} onRetry={() => void acts.refetch()} />;

  return (
    <div className="flex flex-col gap-3">
      {groups.length === 0 ? (
        <Card className="flex flex-col gap-2 p-5 text-center">
          <strong>Todavía no hay actividades.</strong>
          <p className="text-[15px] text-muted">
            {canCreate
              ? `Cargá la primera, ${profile.nickname || profile.full_name.split(" ")[0]}: por ejemplo, la reunión de todas las semanas.`
              : "Cuando la comunidad cargue actividades, las vas a ver acá."}
          </p>
        </Card>
      ) : null}
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2">
          <h2 className="mx-0.5 mt-2 flex items-baseline gap-2">
            <span className="font-display text-[17px] font-extrabold">{relativeDay(g.key, today)}</span>
            <span className="text-[13px] text-muted">{shortDay(g.key)}</span>
          </h2>
          {g.items.map((a) => (
            <ActivityCard key={a.id} a={a} project={a.project_id ? projById.get(a.project_id) : undefined} />
          ))}
        </section>
      ))}
      {canCreate ? <Fab to="/actividades/nueva" label="Actividad" /> : null}
    </div>
  );
}
