import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useApp, useMemberNames } from "../../app/context.tsx";
import { Icon, type IconName } from "../../components/Icon.tsx";
import { Sheet } from "../../components/Sheet.tsx";
import { Button, Card, ConfirmButton, ErrorBox, Field, Loading, useToast } from "../../components/ui.tsx";
import { TYPES, activityKeys, seriesText, useActivity, useProject, useSeries, type Activity, type EditScope } from "../../lib/activities.ts";
import { useActivityRsvps } from "../../lib/attendance.ts";
import { addDaysKey, dayKey, rangeText, timeIn, todayKey, zonedToIso } from "../../lib/dates.ts";
import { coordsOf, directionsUrl, embedUrl } from "../../lib/maps.ts";
import { activityMessage, whatsappLink } from "../../lib/share.ts";
import { errorMessage, must, supabase } from "../../lib/supabase.ts";
import { RsvpSection } from "../attendance/RsvpSection.tsx";
import { BackLink } from "./ActivityCard.tsx";

export function ActivityDetailScreen() {
  const { id } = useParams();
  const { tz, profile } = useApp();
  const { name } = useMemberNames();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const act = useActivity(id);
  const a = act.data;
  const project = useProject(a?.project_id ?? undefined);
  const series = useSeries(a?.series_id ?? null);
  const rsvps = useActivityRsvps(id ?? "");
  const [sheet, setSheet] = useState<null | "edit" | "delete" | "reschedule">(null);
  const [busy, setBusy] = useState(false);

  if (act.isLoading) return <Loading />;
  if (!a || a.deleted_at) return <ErrorBox message={act.error ? errorMessage(act.error) : "Esta actividad ya no existe."} />;

  const t = TYPES[a.type];
  const mine = a.created_by === profile.id;
  const started = new Date(a.starts_at) <= new Date();
  const ended = new Date(a.ends_at) <= new Date();
  const cancelled = a.status === "cancelada";
  // /a/:id muestra la tarjeta con título, fecha y lugar en WhatsApp y después abre la actividad.
  const appUrl = `${window.location.origin}/a/${a.id}`;
  const going = Object.values(rsvps.data ?? {}).filter((r) => r === "voy").length;
  const wa = whatsappLink(
    activityMessage(a, tz, {
      series: series.data,
      project: project.data && !project.data.deleted_at ? project.data : undefined,
      going: cancelled ? 0 : going,
      appUrl
    })
  );

  async function refreshAll() {
    await qc.invalidateQueries({ queryKey: activityKeys.all });
    await qc.invalidateQueries({ queryKey: ["trash"] });
  }

  async function doDelete(scope: EditScope) {
    if (!a) return;
    setBusy(true);
    try {
      const n = must<number>(await supabase.rpc("delete_activity", { p_id: a.id, p_scope: scope }));
      await refreshAll();
      toast(n > 1 ? `${n} actividades a la papelera.` : "Movida a la papelera. Podés restaurarla durante 30 días.");
      navigate("/", { replace: true });
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
      setSheet(null);
    }
  }

  async function doCancel() {
    if (!a) return;
    try {
      must(await supabase.rpc("cancel_activity", { p_id: a.id }));
      await refreshAll();
      toast("Actividad suspendida. Les avisamos a los que iban.");
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <BackLink />
      <div className="flex items-center gap-2 text-sm text-muted">
        <i className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
        {t.label}
      </div>
      <h2 className="font-display text-[27px] font-extrabold leading-tight">{a.title}</h2>
      {cancelled ? (
        <div className="rounded-xl bg-line/70 px-4 py-2.5">
          <strong>Actividad suspendida.</strong>
          {mine ? <span className="text-muted"> Si se hace otro día, tocá “Reprogramar”.</span> : null}
        </div>
      ) : null}

      <Card className="flex flex-col gap-2.5 p-4 text-[15px]">
        <Fact icon="clock" text={rangeText(a.starts_at, a.ends_at, tz)} />
        {series.data ? <Fact icon="repeat" text={seriesText(series.data)} /> : null}
        {a.location ? <Fact icon="pin" text={a.location} /> : null}
        {project.data && !project.data.deleted_at ? (
          <div className="grid grid-cols-[22px_1fr] gap-2.5">
            <Icon name="flag" className="mt-0.5 text-muted" />
            <span>
              Proyecto:{" "}
              <Link to={`/proyectos/${project.data.id}`} className="font-bold text-accent">
                {project.data.name}
              </Link>
            </span>
          </div>
        ) : null}
        {a.description ? <Fact icon="text" text={a.description} /> : null}
        <Fact icon="user" text={`Creada por ${mine ? "vos" : name(a.created_by)}`} muted />
      </Card>

      <MapBlock a={a} />

      <RsvpSection a={a} />

      <a href={wa} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1f8f4e] px-4 font-bold text-white">
        Compartir por WhatsApp
      </a>

      {mine ? (
        <div className="flex flex-wrap gap-2">
          {!ended && !cancelled ? (
            <Button className="flex-1" onClick={() => (a.series_id ? setSheet("edit") : navigate(`/actividades/${a.id}/editar`))}>
              Editar
            </Button>
          ) : null}
          {!started || cancelled ? (
            <Button className="flex-1" onClick={() => setSheet("reschedule")}>
              Reprogramar
            </Button>
          ) : null}
          {!started && !cancelled ? (
            <ConfirmButton className="flex-1" confirmLabel="¿Suspenderla?" onConfirm={() => void doCancel()}>
              Suspender
            </ConfirmButton>
          ) : null}
          {a.series_id ? (
            <Button variant="danger" className="flex-1" onClick={() => setSheet("delete")}>
              Eliminar
            </Button>
          ) : (
            <ConfirmButton className="flex-1" loading={busy} confirmLabel="¿Eliminarla?" onConfirm={() => void doDelete("solo_esta")}>
              Eliminar
            </ConfirmButton>
          )}
        </div>
      ) : null}

      {sheet === "edit" ? (
        <Sheet title="Editar actividad que se repite" text="¿Cambiás solo esta o también las siguientes?" onClose={() => setSheet(null)}>
          <Button variant="primary" onClick={() => navigate(`/actividades/${a.id}/editar`)}>Solo esta</Button>
          <Button onClick={() => navigate(`/actividades/${a.id}/editar?alcance=siguientes`)}>Esta y las siguientes</Button>
          <Button variant="ghost" onClick={() => setSheet(null)}>Volver</Button>
        </Sheet>
      ) : null}
      {sheet === "reschedule" ? <RescheduleSheet a={a} goingCount={going} onClose={() => setSheet(null)} /> : null}
      {sheet === "delete" ? (
        <Sheet title="Eliminar actividad que se repite" text="Va a la papelera y se puede restaurar durante 30 días." onClose={() => setSheet(null)}>
          <Button variant="danger" loading={busy} onClick={() => void doDelete("solo_esta")}>Solo esta</Button>
          <Button variant="danger" loading={busy} onClick={() => void doDelete("esta_y_siguientes")}>Esta y las siguientes</Button>
          <Button variant="ghost" onClick={() => setSheet(null)}>Volver</Button>
        </Sheet>
      ) : null}
    </div>
  );
}

function Fact({ icon, text, muted = false }: { icon: IconName; text: string; muted?: boolean }) {
  return (
    <div className={`grid grid-cols-[22px_1fr] gap-2.5 ${muted ? "text-muted" : ""}`}>
      <Icon name={icon} className="mt-0.5 text-muted" />
      <span className="whitespace-pre-line">{text}</span>
    </div>
  );
}

/** Mapa del lugar + botón para abrir Google Maps. */
function MapBlock({ a }: { a: Activity }) {
  const coords = coordsOf(a);
  const src = embedUrl(a.location, coords);
  const href = directionsUrl(a.location, coords);
  if (!src || !href) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <iframe title={`Mapa: ${a.location ?? "ubicación"}`} src={src} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="block h-44 w-full border-0" />
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 text-[13.5px] text-muted">{coords ? "Ubicación marcada en el mapa" : "Ubicación aproximada según el nombre del lugar"}</p>
        <a href={href} target="_blank" rel="noopener" className="inline-flex min-h-10 flex-none items-center rounded-xl bg-accent px-3.5 text-sm font-bold text-white">
          Cómo llegar
        </a>
      </div>
    </div>
  );
}

/** Cambiar fecha y hora de una sola actividad (también recupera una suspendida). */
function RescheduleSheet({ a, goingCount, onClose }: { a: Activity; goingCount: number; onClose: () => void }) {
  const { tz } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const past = new Date(a.starts_at) <= new Date();
  const baseDay = past ? addDaysKey(todayKey(tz), 1) : dayKey(a.starts_at, tz);
  const spanDays = Math.round((Date.parse(dayKey(a.ends_at, tz)) - Date.parse(dayKey(a.starts_at, tz))) / 864e5);
  const [f, setF] = useState({ date: baseDay, start: timeIn(a.starts_at, tz), endDate: addDaysKey(baseDay, spanDays), end: timeIn(a.ends_at, tz) });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const s = zonedToIso(f.date, f.start, tz), e = zonedToIso(f.endDate, f.end, tz);
    if (e <= s) return setError("El fin tiene que ser después del inicio.");
    if (Date.parse(s) <= Date.now()) return setError("La nueva fecha tiene que ser en el futuro.");
    setSaving(true);
    setError(null);
    try {
      must(await supabase.rpc("reschedule_activity", { p_id: a.id, p_starts_at: s, p_ends_at: e }));
      await qc.invalidateQueries({ queryKey: activityKeys.all });
      toast(goingCount ? `Reprogramada. Les avisamos a los ${goingCount} que iban.` : "Reprogramada.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="Reprogramar"
      text={a.status === "cancelada" ? "Elegí la nueva fecha: la actividad vuelve a estar programada." : "Elegí la nueva fecha y hora. Se mantienen las respuestas y les avisamos a los que iban."}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-2.5">
        <Field id="r_date" type="date" label="Nuevo día" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, endDate: addDaysKey(e.target.value, spanDays) })} />
        <Field id="r_start" type="time" label="Hora" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <Field id="r_edate" type="date" label="Termina" value={f.endDate} min={f.date} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        <Field id="r_end" type="time" label="Hora" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
      </div>
      {a.series_id ? <p className="text-[13px] text-muted">Solo cambia esta fecha; las demás de la serie quedan igual.</p> : null}
      {error ? <ErrorBox message={error} /> : null}
      <Button variant="primary" loading={saving} onClick={() => void save()}>
        Guardar nueva fecha
      </Button>
      <Button variant="ghost" onClick={onClose}>Volver</Button>
    </Sheet>
  );
}
