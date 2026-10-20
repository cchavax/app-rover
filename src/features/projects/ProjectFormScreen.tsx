import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useApp, useMemberNames } from "../../app/context.tsx";
import { Button, ErrorBox, Field, Loading, useToast } from "../../components/ui.tsx";
import { PROJECT_STATUS, useProject, type Project, type ProjectStatus } from "../../lib/activities.ts";
import { addDaysKey, todayKey } from "../../lib/dates.ts";
import { errorMessage, must, supabase } from "../../lib/supabase.ts";
import { displayName } from "../../lib/types.ts";
import { BackLink } from "../activities/ActivityCard.tsx";

export function ProjectFormScreen() {
  const { id } = useParams();
  const project = useProject(id);
  if (id && project.isLoading) return <Loading />;
  if (id && !project.data) return <ErrorBox message={errorMessage(project.error)} />;
  return <ProjectForm key={id ?? "nuevo"} existing={project.data} />;
}

function ProjectForm({ existing }: { existing: Project | undefined }) {
  const { community, profile, tz } = useApp();
  const { members } = useMemberNames();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const today = todayKey(tz);
  const [f, setF] = useState({
    name: existing?.name ?? "",
    goal: existing?.goal ?? "",
    description: existing?.description ?? "",
    start: existing?.start_date ?? today,
    end: existing?.end_date ?? addDaysKey(today, 60),
    status: (existing?.status ?? "idea") as ProjectStatus,
    owners: existing ? existing.owners.map((o) => o.user_id) : [profile.id]
  });
  const [errors, setErrors] = useState<Partial<Record<"name" | "dates" | "owners" | "server", string>>>({});
  const [saving, setSaving] = useState(false);
  const candidates = members.filter((m) => m.status === "activo" && m.role !== "educador");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (f.name.trim().length < 2) errs.name = "Poné un nombre.";
    if (!f.start || !f.end || f.end < f.start) errs.dates = "El fin tiene que ser igual o posterior al inicio.";
    if (!f.owners.length) errs.owners = "Elegí al menos un responsable.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const id = must<string>(
        await supabase.rpc("save_project", {
          p_id: existing?.id ?? null, p_community_id: community.id, p_name: f.name, p_start_date: f.start, p_end_date: f.end,
          p_status: f.status, p_owner_ids: f.owners, p_goal: f.goal, p_description: f.description
        })
      );
      await qc.invalidateQueries({ queryKey: ["projects"] });
      toast(existing ? "Proyecto actualizado." : "Proyecto creado.");
      navigate(`/proyectos/${id}`, { replace: true });
    } catch (err) {
      setErrors({ server: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  const toggleOwner = (uid: string) =>
    setF((prev) => ({ ...prev, owners: prev.owners.includes(uid) ? prev.owners.filter((x) => x !== uid) : [...prev.owners, uid] }));

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <BackLink label="Cancelar" />
      <h2 className="font-display text-2xl font-extrabold">{existing ? "Editar proyecto" : "Nuevo proyecto"}</h2>
      <Field id="p_name" label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Colecta de abrigo" error={errors.name} />
      <Field id="p_goal" label="Objetivo" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder="Qué queremos lograr" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="p_desc" className="text-sm font-bold">Descripción</label>
        <textarea id="p_desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-[84px] rounded-xl border border-line bg-surface px-3 py-2.5 text-base" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field id="p_start" type="date" label="Inicio" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <Field id="p_end" type="date" label="Fin estimado" value={f.end} min={f.start} onChange={(e) => setF({ ...f, end: e.target.value })} />
      </div>
      {errors.dates ? <span className="-mt-2 text-[13px] font-bold text-accent">{errors.dates}</span> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="p_status" className="text-sm font-bold">Estado</label>
        <select id="p_status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ProjectStatus })} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-base">
          {(Object.keys(PROJECT_STATUS) as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>{PROJECT_STATUS[s]}</option>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-bold">Responsables</legend>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {candidates.map((m, i) => (
            <label key={m.user_id} className={`flex items-center gap-3 px-3.5 py-3 text-[15px] ${i ? "border-t border-line" : ""}`}>
              <input type="checkbox" checked={f.owners.includes(m.user_id)} onChange={() => toggleOwner(m.user_id)} className="h-5 w-5 accent-accent" />
              {displayName(m.profile)}
              {m.user_id === profile.id ? <span className="text-sm text-muted">(vos)</span> : null}
            </label>
          ))}
        </div>
        {errors.owners ? <span className="text-[13px] font-bold text-accent">{errors.owners}</span> : null}
      </fieldset>
      {errors.server ? <ErrorBox message={errors.server} /> : null}
      <Button type="submit" variant="primary" loading={saving}>
        {existing ? "Guardar cambios" : "Crear proyecto"}
      </Button>
    </form>
  );
}
