import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useApp, useMemberNames } from "../../app/context.tsx";
import { Button, ErrorBox, Loading, useToast } from "../../components/ui.tsx";
import { useActivity } from "../../lib/activities.ts";
import { RSVP_LABEL, useActivityRsvps, useAttendance } from "../../lib/attendance.ts";
import { cap, dayKey, longDay } from "../../lib/dates.ts";
import { errorMessage, must, supabase } from "../../lib/supabase.ts";
import { displayName } from "../../lib/types.ts";
import { BackLink } from "../activities/ActivityCard.tsx";

export function TakeListScreen() {
  const { id = "" } = useParams();
  const { tz } = useApp();
  const { members } = useMemberNames();
  const act = useActivity(id);
  const rsvps = useActivityRsvps(id);
  const attendance = useAttendance(id, Boolean(act.data?.attendance_taken_at));
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [checked, setChecked] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Precarga: la lista guardada, o si no hay, los que dijeron "voy".
  useEffect(() => {
    if (checked || !act.data || !rsvps.data) return;
    if (act.data.attendance_taken_at) {
      if (attendance.data) setChecked(new Set(attendance.data));
    } else {
      setChecked(new Set(Object.entries(rsvps.data).filter(([, r]) => r === "voy").map(([u]) => u)));
    }
  }, [act.data, rsvps.data, attendance.data, checked]);

  if (act.isLoading || !checked) return <Loading />;
  if (!act.data) return <ErrorBox message={errorMessage(act.error)} />;
  const a = act.data;
  const active = members.filter((m) => m.status === "activo");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      must(await supabase.rpc("save_attendance", { p_activity_id: a.id, p_user_ids: [...(checked ?? [])] }));
      await Promise.all([qc.invalidateQueries({ queryKey: ["attendance"] }), qc.invalidateQueries({ queryKey: ["activities"] })]);
      toast("Asistencia guardada.");
      navigate(`/actividades/${a.id}`, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const toggle = (uid: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <h2 className="font-display text-2xl font-extrabold">Tomar lista</h2>
      <p className="text-[14.5px] text-muted">
        {a.title} · {cap(longDay(dayKey(a.starts_at, tz)))}. Marcá quién fue. Vienen tildados los que dijeron que iban.
      </p>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {active.map((m, i) => {
          const r = rsvps.data?.[m.user_id];
          return (
            <label key={m.user_id} className={`flex items-center gap-3 px-3.5 py-3 text-[15px] ${i ? "border-t border-line" : ""}`}>
              <input type="checkbox" checked={checked.has(m.user_id)} onChange={() => toggle(m.user_id)} className="h-5 w-5 accent-accent" />
              <span className="flex-1">{displayName(m.profile)}</span>
              {r ? <span className="text-[13px] text-muted">dijo “{RSVP_LABEL[r].toLowerCase()}”</span> : null}
            </label>
          );
        })}
      </div>
      <p className="text-[13px] text-muted">
        {checked.size} de {active.length} presentes. Este historial se va a usar para las progresiones personales.
      </p>
      {error ? <ErrorBox message={error} /> : null}
      <Button variant="primary" loading={saving} onClick={() => void save()}>
        Guardar asistencia
      </Button>
    </div>
  );
}
