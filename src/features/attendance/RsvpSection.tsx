import { Link } from "react-router";
import { useApp, useMemberNames } from "../../app/context.tsx";
import { Card, SectionTitle, useToast } from "../../components/ui.tsx";
import type { Activity } from "../../lib/activities.ts";
import { RSVP_LABEL, useActivityRsvps, useAttendance, useSetRsvp, type Rsvp } from "../../lib/attendance.ts";
import { errorMessage } from "../../lib/supabase.ts";
import { displayName } from "../../lib/types.ts";

const SEG_ON: Record<Rsvp, string> = {
  voy: "bg-[var(--ok)] text-surface",
  talvez: "bg-[var(--warn)] text-surface",
  no: "bg-muted text-surface"
};

/** Confirmación (antes) o asistencia real (después) de una actividad. */
export function RsvpSection({ a }: { a: Activity }) {
  const { profile, isCoord, canCreate } = useApp();
  const { members } = useMemberNames();
  const toast = useToast();
  const rsvps = useActivityRsvps(a.id);
  const ended = Date.parse(a.ends_at) <= Date.now();
  const started = Date.parse(a.starts_at) <= Date.now();
  const cancelled = a.status === "cancelada";
  const attendance = useAttendance(a.id, ended && Boolean(a.attendance_taken_at));
  const setRsvp = useSetRsvp();
  const canTakeList = ended && !cancelled && canCreate && (a.created_by === profile.id || isCoord);

  const active = members.filter((m) => m.status === "activo");
  const map: Record<string, Rsvp> = rsvps.data ?? {};
  const groups: Record<Rsvp | "pend", typeof active> = { voy: [], talvez: [], no: [], pend: [] };
  for (const m of active) groups[map[m.user_id] ?? "pend"].push(m);
  const mine = map[profile.id];

  function answer(r: Rsvp) {
    setRsvp.mutate({ activityId: a.id, response: mine === r ? null : r }, { onError: (e) => toast(errorMessage(e)) });
  }

  return (
    <>
      {a.attendance_taken_at && attendance.data ? (
        <>
          <SectionTitle>Asistencia real</SectionTitle>
          <Card className="p-4">
            <p className="mb-2 font-bold">Asistieron {attendance.data.length}</p>
            <Names list={active.filter((m) => attendance.data?.includes(m.user_id))} empty="No fue nadie." />
          </Card>
        </>
      ) : null}

      {!started && !cancelled ? (
        <>
          <SectionTitle>¿Vas?</SectionTitle>
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-line/60 p-1.5" role="group" aria-label="Tu asistencia">
            {(["voy", "talvez", "no"] as const).map((r) => (
              <button
                key={r}
                aria-pressed={mine === r}
                disabled={setRsvp.isPending}
                onClick={() => answer(r)}
                className={`rounded-xl px-1 py-3 font-bold transition ${mine === r ? SEG_ON[r] : "text-muted"}`}
              >
                {RSVP_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="-mt-1.5 text-center text-[12.5px] text-muted">Podés cambiarla hasta que empiece. Tocá de nuevo para borrarla.</p>
        </>
      ) : null}

      <div className="grid grid-cols-4 gap-1.5 text-center">
        {([
          ["voy", "Van"],
          ["talvez", "Tal vez"],
          ["no", "No van"],
          ["pend", "Sin resp."]
        ] as const).map(([k, l]) => (
          <div key={k} className="rounded-xl bg-line/50 px-1 py-2">
            <strong className="block font-display text-[22px] tabular-nums">{groups[k].length}</strong>
            <span className="text-[11.5px] text-muted">{l}</span>
          </div>
        ))}
      </div>

      <Card className="px-4">
        {([
          ["voy", "Van"],
          ["talvez", "Tal vez"],
          ["no", "No van"],
          ["pend", "No respondieron"]
        ] as const).map(([k, l], i) => (
          <details key={k} open={i === 0} className={i ? "border-t border-line" : ""}>
            <summary className="flex cursor-pointer justify-between py-3 font-bold">
              {l} <span className="font-normal text-muted">{groups[k].length}</span>
            </summary>
            <div className="pb-3">
              <Names list={groups[k]} empty="Nadie." />
            </div>
          </details>
        ))}
      </Card>

      {canTakeList ? (
        <Link to={`/actividades/${a.id}/lista`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface px-4 font-bold">
          {a.attendance_taken_at ? "Corregir la lista" : "Tomar lista"}
        </Link>
      ) : null}
    </>
  );
}

function Names({ list, empty }: { list: { user_id: string; role: string; profile: { full_name: string; nickname: string | null } | null }[]; empty: string }) {
  if (!list.length) return <span className="text-sm text-muted">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((m) => (
        <span key={m.user_id} className="rounded-full bg-line/50 px-2.5 py-1 text-sm">
          {displayName(m.profile)}
          {m.role === "educador" ? <span className="text-muted"> · edu</span> : null}
        </span>
      ))}
    </div>
  );
}
