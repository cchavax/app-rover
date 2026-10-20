import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { must, supabase } from "./supabase.ts";

export type Rsvp = "voy" | "talvez" | "no";

export const RSVP_LABEL: Record<Rsvp, string> = { voy: "Voy", talvez: "Tal vez", no: "No voy" };

export const attendanceKeys = {
  rsvps: ["rsvps"] as const,
  forActivity: (id: string) => ["rsvps", "activity", id] as const,
  mine: (uid: string, ids: string[]) => ["rsvps", "mine", uid, ids.join(",")] as const,
  attendance: (id: string) => ["attendance", id] as const
};

// Los datos se devuelven como objetos comunes (no Map) para que se puedan guardar
// en el celular y verse sin señal: Map no sobrevive a JSON.

/** Respuestas de todos para una actividad: user_id → respuesta. */
export function useActivityRsvps(activityId: string) {
  return useQuery({
    queryKey: attendanceKeys.forActivity(activityId),
    enabled: Boolean(activityId),
    queryFn: async () => {
      const rows = must<{ user_id: string; response: Rsvp }[]>(
        await supabase.from("rsvps").select("user_id, response").eq("activity_id", activityId)
      );
      return Object.fromEntries(rows.map((r) => [r.user_id, r.response])) as Record<string, Rsvp>;
    }
  });
}

/** Mis respuestas para una lista de actividades: activity_id → respuesta. */
export function useMyRsvps(uid: string, activityIds: string[]) {
  return useQuery({
    queryKey: attendanceKeys.mine(uid, activityIds),
    enabled: activityIds.length > 0,
    queryFn: async () => {
      const rows = must<{ activity_id: string; response: Rsvp }[]>(
        await supabase.from("rsvps").select("activity_id, response").eq("user_id", uid).in("activity_id", activityIds)
      );
      return Object.fromEntries(rows.map((r) => [r.activity_id, r.response])) as Record<string, Rsvp>;
    }
  });
}

/** Quiénes fueron de verdad (lista tomada). */
export function useAttendance(activityId: string, enabled = true) {
  return useQuery({
    queryKey: attendanceKeys.attendance(activityId),
    enabled: enabled && Boolean(activityId),
    queryFn: async () =>
      must<{ user_id: string }[]>(await supabase.from("attendance").select("user_id").eq("activity_id", activityId)).map((r) => r.user_id)
  });
}

export function useSetRsvp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { activityId: string; response: Rsvp | null }) =>
      must(await supabase.rpc("set_rsvp", { p_activity_id: v.activityId, p_response: v.response })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: attendanceKeys.rsvps });
    }
  });
}
