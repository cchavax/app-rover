import { useQuery } from "@tanstack/react-query";
import { must, supabase } from "./supabase.ts";
import { ordinal, weekdayName } from "./dates.ts";

export type ActivityType = "reunion" | "campamento" | "servicio" | "salida" | "otro";
export type ProjectStatus = "idea" | "en_curso" | "finalizado" | "cancelado";
export type EditScope = "solo_esta" | "esta_y_siguientes";

export interface Activity {
  id: string;
  community_id: string;
  series_id: string | null;
  project_id: string | null;
  title: string;
  description: string | null;
  type: ActivityType;
  starts_at: string;
  ends_at: string;
  location: string | null;
  status: "programada" | "cancelada";
  created_by: string;
  deleted_at: string | null;
  attendance_taken_at: string | null;
}

export interface Project {
  id: string;
  community_id: string;
  name: string;
  goal: string | null;
  description: string | null;
  start_date: string;
  end_date: string;
  status: ProjectStatus;
  color_index: number;
  created_by: string;
  deleted_at: string | null;
  owners: { user_id: string }[];
}

export interface Series {
  id: string;
  frequency: "semanal" | "mensual_dia" | "mensual_semana";
  interval: number;
  month_day: number | null;
  month_week: number | null;
  weekday: number | null;
  until_date: string;
}

export const TYPES: Record<ActivityType, { label: string; color: string }> = {
  reunion: { label: "Reunión", color: "var(--t-reunion)" },
  campamento: { label: "Campamento", color: "var(--t-campamento)" },
  servicio: { label: "Servicio", color: "var(--t-servicio)" },
  salida: { label: "Salida", color: "var(--t-salida)" },
  otro: { label: "Otro", color: "var(--t-otro)" }
};

export const PROJECT_STATUS: Record<ProjectStatus, string> = {
  idea: "Idea",
  en_curso: "En curso",
  finalizado: "Finalizado",
  cancelado: "Cancelado"
};

export const projectColor = (i: number) => `var(--p${i % 6})`;

export function seriesText(s: Series): string {
  if (s.frequency === "semanal") {
    const day = weekdayName(s.weekday ?? 0);
    return s.interval === 1 ? `Se repite todos los ${day}s` : `Se repite cada ${s.interval} semanas, los ${day}s`;
  }
  if (s.frequency === "mensual_dia") return `Se repite todos los meses el día ${s.month_day}`;
  const day = weekdayName(s.weekday ?? 0);
  return s.month_week === -1 ? `Se repite el último ${day} de cada mes` : `Se repite el ${ordinal(s.month_week ?? 1)} ${day} de cada mes`;
}

export const activityKeys = {
  all: ["activities"] as const,
  range: (cid: string, from: string, to: string) => ["activities", cid, from, to] as const,
  one: (id: string) => ["activities", "one", id] as const,
  byProject: (pid: string) => ["activities", "project", pid] as const,
  series: (id: string) => ["series", id] as const,
  projects: (cid: string) => ["projects", cid] as const,
  project: (id: string) => ["projects", "one", id] as const,
  trash: (cid: string) => ["trash", cid] as const
};

const ACT_COLS = "id, community_id, series_id, project_id, title, description, type, starts_at, ends_at, location, status, created_by, deleted_at, attendance_taken_at";

/** Actividades no borradas que se solapan con [from, to). */
export function useActivitiesInRange(cid: string, fromIso: string, toIso: string) {
  return useQuery({
    queryKey: activityKeys.range(cid, fromIso, toIso),
    queryFn: async () =>
      must<Activity[]>(
        await supabase
          .from("activities")
          .select(ACT_COLS)
          .eq("community_id", cid)
          .is("deleted_at", null)
          .lt("starts_at", toIso)
          .gt("ends_at", fromIso)
          .order("starts_at")
          .limit(500)
      )
  });
}

export function useActivity(id: string | undefined) {
  return useQuery({
    queryKey: activityKeys.one(id ?? ""),
    enabled: Boolean(id),
    queryFn: async () => must<Activity>(await supabase.from("activities").select(ACT_COLS).eq("id", id ?? "").single())
  });
}

export function useProjectActivities(pid: string) {
  return useQuery({
    queryKey: activityKeys.byProject(pid),
    queryFn: async () =>
      must<Activity[]>(
        await supabase.from("activities").select(ACT_COLS).eq("project_id", pid).is("deleted_at", null).order("starts_at").limit(300)
      )
  });
}

export function useSeries(id: string | null) {
  return useQuery({
    queryKey: activityKeys.series(id ?? ""),
    enabled: Boolean(id),
    queryFn: async () => must<Series>(await supabase.from("activity_series").select("*").eq("id", id ?? "").single())
  });
}

const PROJ_COLS = "id, community_id, name, goal, description, start_date, end_date, status, color_index, created_by, deleted_at, owners:project_owners(user_id)";

export function useProjects(cid: string) {
  return useQuery({
    queryKey: activityKeys.projects(cid),
    queryFn: async () =>
      must<Project[]>(
        await supabase.from("projects").select(PROJ_COLS).eq("community_id", cid).is("deleted_at", null).order("start_date", { ascending: false })
      )
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: activityKeys.project(id ?? ""),
    enabled: Boolean(id),
    queryFn: async () => must<Project>(await supabase.from("projects").select(PROJ_COLS).eq("id", id ?? "").single())
  });
}

export function useTrash(cid: string) {
  return useQuery({
    queryKey: activityKeys.trash(cid),
    queryFn: async () => {
      const [a, p] = await Promise.all([
        supabase.from("activities").select(ACT_COLS).eq("community_id", cid).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(200),
        supabase.from("projects").select(PROJ_COLS).eq("community_id", cid).not("deleted_at", "is", null).order("deleted_at", { ascending: false })
      ]);
      return { activities: must<Activity[]>(a), projects: must<Project[]>(p) };
    }
  });
}

/** Rango de "Próximas": desde el comienzo de la hora actual hasta 70 días después.
 *  Redondeado para que distintas pantallas compartan la misma consulta en caché. */
export function upcomingRange(): { from: string; to: string } {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const to = new Date(now.getTime() + 70 * 864e5);
  return { from: now.toISOString(), to: to.toISOString() };
}
