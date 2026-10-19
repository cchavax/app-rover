import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useApp, useMemberNames } from "../../app/context.tsx";
import { Icon, type IconName } from "../../components/Icon.tsx";
import { Sheet } from "../../components/Sheet.tsx";
import { Button, Card, ConfirmButton, ErrorBox, Loading, useToast } from "../../components/ui.tsx";
import { TYPES, activityKeys, seriesText, useActivity, useProject, useSeries, type EditScope } from "../../lib/activities.ts";
import { rangeText } from "../../lib/dates.ts";
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
  const [sheet, setSheet] = useState<null | "edit" | "delete">(null);
  const [busy, setBusy] = useState(false);

  if (act.isLoading) return <Loading />;
  if (act.error || !a || a.deleted_at) return <ErrorBox message={act.error ? errorMessage(act.error) : "Esta actividad ya no existe."} />;

  const t = TYPES[a.type];
  const mine = a.created_by === profile.id;
  const started = new Date(a.starts_at) <= new Date();
  const ended = new Date(a.ends_at) <= new Date();
  const cancelled = a.status === "cancelada";
  const appUrl = `${window.location.origin}/actividades/${a.id}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`*${a.title}*\n${rangeText(a.starts_at, a.ends_at, tz)}\n${a.location ? a.location + "\n" : ""}${appUrl}`)}`;

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
      toast("Actividad cancelada.");
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
      {cancelled ? <div className="rounded-xl bg-line/70 px-4 py-2.5 font-bold">Actividad cancelada</div> : null}

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
          {!started && !cancelled ? (
            <ConfirmButton className="flex-1" confirmLabel="¿Cancelarla?" onConfirm={() => void doCancel()}>
              Cancelar
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
