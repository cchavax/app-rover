import { Suspense, lazy, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "../../app/context.tsx";
import { Button, ErrorBox, Field, Loading, useToast } from "../../components/ui.tsx";
import { TYPES, activityKeys, useActivity, useProjects, type ActivityType } from "../../lib/activities.ts";
import { addDaysKey, dayKey, daysInMonthOfKey, dowOfKey, ordinal, timeIn, todayKey, weekdayName, zonedToIso } from "../../lib/dates.ts";
import { errorMessage, must, supabase } from "../../lib/supabase.ts";
import { Spinner } from "../../components/Loader.tsx";
import type { LatLng } from "../../lib/maps.ts";

const LocationPicker = lazy(() => import("../../components/LocationPicker.tsx"));
import { BackLink } from "./ActivityCard.tsx";

type Repeat = "no" | "w1" | "w2" | "wN" | "md" | "mw" | "ml";

type Form = {
  title: string;
  type: ActivityType;
  date: string;
  start: string;
  endDate: string;
  end: string;
  location: string;
  projectId: string;
  description: string;
  coords: LatLng | null;
  virtual: boolean;
  repeat: Repeat;
  everyN: string;
  until: string;
};

/** Crear (sin :id) o editar (con :id) una actividad. */
export function ActivityFormScreen() {
  const { id } = useParams();
  const editing = Boolean(id);
  const existing = useActivity(id);
  const { tz } = useApp();

  if (editing && existing.isLoading) return <Loading />;
  if (editing && (existing.error || !existing.data)) return <ErrorBox message={errorMessage(existing.error)} />;

  const a = existing.data;
  const initial = a
    ? {
        title: a.title,
        type: a.type,
        date: dayKey(a.starts_at, tz),
        start: timeIn(a.starts_at, tz),
        endDate: dayKey(a.ends_at, tz),
        end: timeIn(a.ends_at, tz),
        location: a.location ?? "",
        projectId: a.project_id ?? "",
        description: a.description ?? "",
        coords: a.location_lat != null && a.location_lng != null ? { lat: a.location_lat, lng: a.location_lng } : null,
        virtual: a.location_lat == null && !a.location
      }
    : null;
  return <ActivityForm key={id ?? "nueva"} initial={initial} activityId={id} isSeries={Boolean(a?.series_id)} />;
}

function ActivityForm({
  initial,
  activityId,
  isSeries
}: {
  initial: Omit<Form, "repeat" | "everyN" | "until"> | null;
  activityId: string | undefined;
  isSeries: boolean;
}) {
  const { community, tz } = useApp();
  const home =
    community.home_lat != null && community.home_lng != null
      ? { name: community.home_name || "Sede del grupo", lat: community.home_lat, lng: community.home_lng }
      : null;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const projects = useProjects(community.id);
  const scopeFollowing = params.get("alcance") === "siguientes";

  const defaultDate = params.get("fecha") ?? addDaysKey(todayKey(tz), 1);
  const [f, setF] = useState<Form>(() => ({
    title: "",
    type: "reunion",
    date: defaultDate,
    start: "15:00",
    endDate: defaultDate,
    end: "18:00",
    location: "",
    projectId: params.get("proyecto") ?? "",
    description: "",
    coords: null,
    virtual: false,
    ...(initial ?? {}),
    repeat: "no",
    everyN: "3",
    until: addDaysKey(initial?.date ?? defaultDate, 56)
  }));
  const [errors, setErrors] = useState<Partial<Record<"title" | "time" | "until" | "place" | "server", string>>>({});
  const [saving, setSaving] = useState(false);

  // Si cambia la fecha de inicio y la de fin era la misma, la acompaña.
  const setDate = (date: string) =>
    setF((prev) => ({ ...prev, date, endDate: prev.endDate === prev.date || prev.endDate < date ? date : prev.endDate }));

  useEffect(() => {
    // La fecha "hasta" nunca queda antes del inicio.
    if (f.until < f.date) setF((prev) => ({ ...prev, until: addDaysKey(prev.date, 56) }));
  }, [f.date, f.until]);

  const dom = Number(f.date.slice(8));
  const dow = dowOfKey(f.date);
  const nth = Math.ceil(dom / 7);
  const isLastOfMonth = dom + 7 > daysInMonthOfKey(f.date);
  const day = weekdayName(dow);

  const repeatOptions: { v: Repeat; label: string }[] = [
    { v: "no", label: "No se repite" },
    { v: "w1", label: `Todos los ${day}s` },
    { v: "w2", label: `Cada 2 semanas (${day})` },
    { v: "wN", label: "Cada N semanas…" },
    { v: "md", label: `Todos los meses el día ${dom}` },
    ...(nth <= 4 ? [{ v: "mw" as Repeat, label: `El ${ordinal(nth)} ${day} de cada mes` }] : []),
    ...(isLastOfMonth ? [{ v: "ml" as Repeat, label: `El último ${day} de cada mes` }] : [])
  ];

  function recurrence(): Record<string, unknown> | null {
    switch (f.repeat) {
      case "no": return null;
      case "w1": return { frequency: "semanal", interval: 1, until: f.until };
      case "w2": return { frequency: "semanal", interval: 2, until: f.until };
      case "wN": return { frequency: "semanal", interval: Number(f.everyN), until: f.until };
      case "md": return { frequency: "mensual_dia", interval: 1, until: f.until };
      case "mw": return { frequency: "mensual_semana", interval: 1, until: f.until };
      case "ml": return { frequency: "mensual_semana", interval: 1, until: f.until, last: true };
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (f.title.trim().length < 2) errs.title = "Poné un título.";
    if (!f.date || !f.start || !f.endDate || !f.end) errs.time = "Completá fechas y horarios.";
    const startsAt = zonedToIso(f.date, f.start, tz);
    const endsAt = zonedToIso(f.endDate, f.end, tz);
    if (!errs.time && endsAt <= startsAt) errs.time = "El fin tiene que ser después del inicio.";
    if (!f.virtual && !f.coords) errs.place = "Marcá el lugar en el mapa: buscalo, tocá el mapa o usá la sede. Si es por videollamada, tildá “Es virtual”.";
    if (!f.virtual && f.location.trim().length < 2) errs.place = errs.place ?? "Escribí el nombre del lugar.";
    if (f.repeat !== "no") {
      if (f.until < f.date) errs.until = "La fecha “hasta” tiene que ser posterior al inicio.";
      if (f.until > addDaysKey(f.date, 365)) errs.until = "Una serie puede durar como máximo un año.";
      if (f.repeat === "wN" && !(Number(f.everyN) >= 1 && Number(f.everyN) <= 12)) errs.until = "Elegí cada cuántas semanas (1 a 12).";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      let targetId = activityId;
      if (activityId) {
        must(
          await supabase.rpc("update_activity", {
            p_id: activityId, p_title: f.title, p_type: f.type, p_starts_at: startsAt, p_ends_at: endsAt,
            p_description: f.description, p_location: f.location, p_project_id: f.projectId || null,
            p_scope: isSeries && scopeFollowing ? "esta_y_siguientes" : "solo_esta",
            p_lat: f.virtual ? null : f.coords?.lat ?? null, p_lng: f.virtual ? null : f.coords?.lng ?? null
          })
        );
      } else {
        targetId = must<string>(
          await supabase.rpc("create_activity", {
            p_community_id: community.id, p_title: f.title, p_type: f.type, p_starts_at: startsAt, p_ends_at: endsAt,
            p_description: f.description, p_location: f.location, p_project_id: f.projectId || null, p_recurrence: recurrence(),
            p_lat: f.virtual ? null : f.coords?.lat ?? null, p_lng: f.virtual ? null : f.coords?.lng ?? null
          })
        );
      }
      await qc.invalidateQueries({ queryKey: activityKeys.all });
      toast(activityId ? "Cambios guardados." : f.repeat === "no" ? "Actividad creada." : "Actividades creadas.");
      navigate(`/actividades/${targetId}`, { replace: true });
    } catch (err) {
      setErrors({ server: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  const activeProjects = (projects.data ?? []).filter((p) => p.status === "idea" || p.status === "en_curso" || p.id === f.projectId);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <BackLink label="Cancelar" />
      <h2 className="font-display text-2xl font-extrabold">{activityId ? "Editar actividad" : "Nueva actividad"}</h2>
      {activityId && isSeries ? (
        <p className="rounded-xl bg-line/50 px-4 py-3 text-[14.5px]">
          Estás editando {scopeFollowing ? <strong>esta y las siguientes</strong> : <strong>solo esta</strong>} de la serie.
          {scopeFollowing ? " Las siguientes mantienen su fecha y toman el horario nuevo." : ""}
        </p>
      ) : null}

      <Field id="f_title" label="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Reunión de comunidad" error={errors.title} autoComplete="off" />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Tipo</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo">
          {(Object.keys(TYPES) as ActivityType[]).map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={f.type === k}
              onClick={() => setF({ ...f, type: k })}
              className={`inline-flex items-center gap-1.5 rounded-full border bg-surface px-3 py-1.5 text-sm ${f.type === k ? "font-bold" : "border-line"}`}
              style={f.type === k ? { borderColor: TYPES[k].color, boxShadow: `inset 0 0 0 1px ${TYPES[k].color}` } : undefined}
            >
              <i className="h-2.5 w-2.5 rounded-full" style={{ background: TYPES[k].color }} />
              {TYPES[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field id="f_date" type="date" label="Empieza" value={f.date} onChange={(e) => setDate(e.target.value)} />
        <Field id="f_start" type="time" label="Hora" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <Field id="f_edate" type="date" label="Termina" value={f.endDate} min={f.date} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        <Field id="f_end" type="time" label="Hora" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
      </div>
      {errors.time ? <span className="-mt-2 text-[13px] font-bold text-accent">{errors.time}</span> : null}

      <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5">
        <Field
          id="f_place"
          label={f.virtual ? "Dónde (opcional)" : "Lugar"}
          value={f.location}
          onChange={(e) => setF({ ...f, location: e.target.value })}
          placeholder={f.virtual ? "Meet, Zoom, grupo de WhatsApp…" : "Escribí el lugar y buscalo en el mapa"}
        />
        <label className="flex items-center gap-2.5 text-[15px]">
          <input type="checkbox" checked={f.virtual} onChange={(e) => setF({ ...f, virtual: e.target.checked })} className="h-5 w-5 accent-accent" />
          Es virtual / no tiene un lugar físico
        </label>
        {!f.virtual ? (
          <>
            {home ? (
              <button
                type="button"
                onClick={() => setF((prev) => ({ ...prev, location: home.name, coords: { lat: home.lat, lng: home.lng } }))}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent-soft px-4 font-bold text-accent"
              >
                Usar la sede: {home.name}
              </button>
            ) : null}
            <Suspense fallback={<div className="flex h-60 items-center justify-center gap-2 text-muted"><Spinner /> Cargando mapa…</div>}>
              <LocationPicker
                value={f.coords}
                query={f.location}
                onChange={(coords) => setF((prev) => ({ ...prev, coords }))}
                onPlaceName={(name) => setF((prev) => ({ ...prev, location: prev.location.trim() ? prev.location : name }))}
              />
            </Suspense>
          </>
        ) : null}
        {errors.place ? <span className="text-[13px] font-bold text-accent">{errors.place}</span> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="f_proj" className="text-sm font-bold">Proyecto (opcional)</label>
        <select id="f_proj" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-base">
          <option value="">Ninguno</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="f_desc" className="text-sm font-bold">Descripción</label>
        <textarea id="f_desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Qué llevar, cómo llegar…" className="min-h-[84px] rounded-xl border border-line bg-surface px-3 py-2.5 text-base" />
      </div>

      {!activityId ? (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5">
          <label htmlFor="f_rep" className="text-sm font-bold">Repetir</label>
          <select id="f_rep" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value as Repeat })} className="rounded-xl border border-line bg-bg px-3 py-2.5 text-base">
            {repeatOptions.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
          {f.repeat === "wN" ? (
            <Field id="f_n" type="number" inputMode="numeric" min={1} max={12} label="Cada cuántas semanas" value={f.everyN} onChange={(e) => setF({ ...f, everyN: e.target.value })} />
          ) : null}
          {f.repeat !== "no" ? (
            <Field id="f_until" type="date" label="Hasta" min={f.date} value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} error={errors.until} hint="Como máximo, un año. Después podés crear otra serie." />
          ) : null}
        </div>
      ) : null}

      {errors.server ? <ErrorBox message={errors.server} /> : null}
      <Button type="submit" variant="primary" loading={saving}>
        {activityId ? "Guardar cambios" : "Crear actividad"}
      </Button>
    </form>
  );
}
