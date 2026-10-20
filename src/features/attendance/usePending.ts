import { useMemo } from "react";
import { useApp } from "../../app/context.tsx";
import { upcomingRange, useActivitiesInRange, type Activity } from "../../lib/activities.ts";
import { useMyRsvps, type Rsvp } from "../../lib/attendance.ts";

/** Próximas actividades + mis respuestas + cuáles me faltan responder. */
export function useUpcomingWithMyRsvps() {
  const { community, profile } = useApp();
  const range = upcomingRange();
  const acts = useActivitiesInRange(community.id, range.from, range.to);
  const ids = useMemo(() => (acts.data ?? []).map((a) => a.id), [acts.data]);
  const mine = useMyRsvps(profile.id, ids);

  const pending = useMemo(() => {
    const now = Date.now();
    const answered: Record<string, Rsvp> = mine.data ?? {};
    return (acts.data ?? []).filter((a) => a.status !== "cancelada" && Date.parse(a.starts_at) > now && !answered[a.id]);
  }, [acts.data, mine.data]);

  return { acts, mine: mine.data, pending, loadingMine: mine.isLoading && ids.length > 0 };
}

/** Actividades de las últimas 2 semanas en las que yo debería tomar lista y todavía no se tomó. */
export function useListsToTake() {
  const { community, profile, canCreate, isCoord } = useApp();
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const from = new Date(now.getTime() - 14 * 864e5).toISOString();
  const acts = useActivitiesInRange(community.id, from, now.toISOString());
  return useMemo(() => {
    if (!canCreate) return [] as Activity[];
    const t = Date.now();
    return (acts.data ?? []).filter(
      (a) => Date.parse(a.ends_at) <= t && a.status !== "cancelada" && !a.attendance_taken_at && (a.created_by === profile.id || isCoord)
    );
  }, [acts.data, canCreate, isCoord, profile.id]);
}
