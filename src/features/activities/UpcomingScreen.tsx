import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useApp } from "../../app/context.tsx";
import { Button, Card, ErrorBox, Loading } from "../../components/ui.tsx";
import { useProjects, type Activity } from "../../lib/activities.ts";
import { dayKey, relativeDay, shortDay, todayKey } from "../../lib/dates.ts";
import { errorMessage } from "../../lib/supabase.ts";
import { useListsToTake, useUpcomingWithMyRsvps } from "../attendance/usePending.ts";
import { ActivityCard, Fab } from "./ActivityCard.tsx";

export function UpcomingScreen() {
  const { community, canCreate, tz, profile } = useApp();
  const today = todayKey(tz);
  const { acts, mine, pending } = useUpcomingWithMyRsvps();
  const toList = useListsToTake();
  const projects = useProjects(community.id);
  const projById = new Map((projects.data ?? []).map((p) => [p.id, p]));
  const [onlyPending, setOnlyPending] = useState(false);

  const shown = onlyPending ? pending : acts.data ?? [];
  const groups = useMemo(() => {
    const out: { key: string; items: Activity[] }[] = [];
    for (const a of shown) {
      const k = dayKey(a.starts_at, tz) < today ? today : dayKey(a.starts_at, tz); // las que ya empezaron van en "Hoy"
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(a);
      else out.push({ key: k, items: [a] });
    }
    return out;
  }, [shown, tz, today]);

  if (acts.isLoading) return <Loading />;
  if (acts.error && !acts.data) return <ErrorBox message={errorMessage(acts.error)} onRetry={() => void acts.refetch()} />;

  const firstList = toList[0];

  return (
    <div className="flex flex-col gap-3">
      {pending.length > 0 || onlyPending ? (
        <div className="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3">
          <p className="flex-1 text-[14.5px]">
            {pending.length ? (
              <>
                <strong>
                  {pending.length} {pending.length === 1 ? "actividad" : "actividades"} sin responder.
                </strong>{" "}
                Avisá si vas así se organizan mejor.
              </>
            ) : (
              <strong>Respondiste todo. Bien ahí.</strong>
            )}
          </p>
          <Button className="min-h-9 px-3 py-1 text-sm" onClick={() => setOnlyPending(!onlyPending)}>
            {onlyPending ? "Ver todas" : "Ver"}
          </Button>
        </div>
      ) : null}

      {firstList ? (
        <div className="flex items-center gap-3 rounded-2xl bg-line/50 px-4 py-3">
          <p className="flex-1 text-[14.5px]">
            <strong>Falta tomar lista</strong> de {firstList.title} ({shortDay(dayKey(firstList.starts_at, tz))}).
            {toList.length > 1 ? ` Y de ${toList.length - 1} más.` : ""}
          </p>
          <Link to={`/actividades/${firstList.id}/lista`} className="inline-flex min-h-9 items-center rounded-xl border border-line bg-surface px-3 text-sm font-bold">
            Tomar lista
          </Link>
        </div>
      ) : null}

      {groups.length === 0 && !onlyPending ? (
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
            <ActivityCard key={a.id} a={a} project={a.project_id ? projById.get(a.project_id) : undefined} rsvp={mine?.[a.id]} showRsvp />
          ))}
        </section>
      ))}
      {canCreate ? <Fab to="/actividades/nueva" label="Actividad" /> : null}
    </div>
  );
}
