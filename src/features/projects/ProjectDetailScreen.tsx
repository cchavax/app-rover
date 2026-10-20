import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useApp, useMemberNames } from "../../app/context.tsx";
import { Icon } from "../../components/Icon.tsx";
import { Card, ConfirmButton, ErrorBox, Loading, SectionTitle, useToast } from "../../components/ui.tsx";
import { PROJECT_STATUS, projectColor, useProject, useProjectActivities } from "../../lib/activities.ts";
import { longDay } from "../../lib/dates.ts";
import { errorMessage, must, supabase } from "../../lib/supabase.ts";
import { ActivityCard, BackLink } from "../activities/ActivityCard.tsx";

export function ProjectDetailScreen() {
  const { id } = useParams();
  const { profile, canCreate } = useApp();
  const { name } = useMemberNames();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const project = useProject(id);
  const acts = useProjectActivities(id ?? "");

  if (project.isLoading) return <Loading />;
  const p = project.data;
  if (!p || p.deleted_at) return <ErrorBox message={project.error ? errorMessage(project.error) : "Este proyecto ya no existe."} />;

  const isOwner = p.owners.some((o) => o.user_id === profile.id);
  const canEdit = canCreate && (p.created_by === profile.id || isOwner);
  const canDelete = canCreate && p.created_by === profile.id;
  const now = new Date();
  const next = (acts.data ?? []).filter((a) => new Date(a.ends_at) > now);
  const past = (acts.data ?? []).filter((a) => new Date(a.ends_at) <= now).reverse();
  const nextAct = next[0];
  const waText = [
    `🔥 *${p.name}*`,
    `_Proyecto · ${PROJECT_STATUS[p.status]}_`,
    "",
    p.goal ? `🎯 ${p.goal}` : null,
    `📅 Del ${longDay(p.start_date)} al ${longDay(p.end_date)}`,
    `👥 A cargo: ${p.owners.map((o) => name(o.user_id)).join(", ")}`,
    nextAct ? `⏭️ Próxima actividad: ${nextAct.title}` : null,
    "",
    `👉 Mirá el proyecto en Fogón: ${window.location.origin}/p/${p.id}`
  ]
    .filter((l) => l !== null)
    .join("\n");
  const wa = `https://wa.me/?text=${encodeURIComponent(waText)}`;

  async function remove() {
    try {
      must(await supabase.rpc("delete_project", { p_id: p?.id }));
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["trash"] });
      toast("Proyecto movido a la papelera.");
      navigate("/proyectos", { replace: true });
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <BackLink />
      <span className="self-start rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: projectColor(p.color_index) }}>
        {PROJECT_STATUS[p.status]}
      </span>
      <h2 className="font-display text-[27px] font-extrabold leading-tight">{p.name}</h2>

      <Card className="flex flex-col gap-2.5 p-4 text-[15px]">
        {p.goal ? (
          <div className="grid grid-cols-[22px_1fr] gap-2.5"><Icon name="target" className="mt-0.5 text-muted" /><span><strong>Objetivo:</strong> {p.goal}</span></div>
        ) : null}
        {p.description ? (
          <div className="grid grid-cols-[22px_1fr] gap-2.5"><Icon name="text" className="mt-0.5 text-muted" /><span className="whitespace-pre-line">{p.description}</span></div>
        ) : null}
        <div className="grid grid-cols-[22px_1fr] gap-2.5"><Icon name="calendar" className="mt-0.5 text-muted" /><span>Del {longDay(p.start_date)} al {longDay(p.end_date)} (estimado)</span></div>
        <div className="grid grid-cols-[22px_1fr] gap-2.5"><Icon name="people" className="mt-0.5 text-muted" /><span>Responsables: {p.owners.map((o) => name(o.user_id)).join(", ")}</span></div>
      </Card>

      <SectionTitle>Próximas actividades</SectionTitle>
      {next.length ? next.map((a) => <ActivityCard key={a.id} a={a} />) : <p className="text-[14.5px] text-muted">No hay actividades programadas.</p>}
      {canCreate ? (
        <Link to={`/actividades/nueva?proyecto=${p.id}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface px-4 font-bold">
          + Agregar actividad al proyecto
        </Link>
      ) : null}
      {past.length ? (
        <>
          <SectionTitle>Ya hechas</SectionTitle>
          {past.map((a) => <ActivityCard key={a.id} a={a} />)}
        </>
      ) : null}

      <a href={wa} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1f8f4e] px-4 font-bold text-white">
        Compartir por WhatsApp
      </a>
      {canEdit || canDelete ? (
        <div className="flex gap-2">
          {canEdit ? (
            <Link to={`/proyectos/${p.id}/editar`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line bg-surface px-4 font-bold">
              Editar
            </Link>
          ) : null}
          {canDelete ? (
            <ConfirmButton className="flex-1" confirmLabel="¿Eliminar el proyecto?" onConfirm={() => void remove()}>
              Eliminar
            </ConfirmButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
