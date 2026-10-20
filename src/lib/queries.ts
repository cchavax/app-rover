import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { must, supabase } from "./supabase.ts";
import type { Community, MemberRole, MemberWithProfile, Membership, Profile } from "./types.ts";

export const keys = {
  profile: (uid: string) => ["profile", uid] as const,
  myMemberships: (uid: string) => ["my-memberships", uid] as const,
  community: (cid: string) => ["community", cid] as const,
  members: (cid: string) => ["members", cid] as const,
  phones: (cid: string) => ["phones", cid] as const,
  inviteCode: (cid: string) => ["invite-code", cid] as const,
  pendingCommunities: ["pending-communities"] as const
};

export function useProfile(uid: string) {
  return useQuery({
    queryKey: keys.profile(uid),
    queryFn: async () => must<Profile>(await supabase.from("profiles").select("*").eq("id", uid).single())
  });
}

export function useMyMemberships(uid: string) {
  return useQuery({
    queryKey: keys.myMemberships(uid),
    queryFn: async () =>
      must<Membership[]>(await supabase.from("memberships").select("*").eq("user_id", uid).order("requested_at"))
  });
}

const COMMUNITY_BASE = "id, name, scout_group, city, timezone, status, created_by, created_at";
const COMMUNITY_EXTRA = "home_name, home_lat, home_lng";

export function useCommunity(cid: string | undefined) {
  return useQuery({
    queryKey: keys.community(cid ?? ""),
    enabled: Boolean(cid),
    queryFn: async () => {
      const full = await supabase.from("communities").select(`${COMMUNITY_BASE}, ${COMMUNITY_EXTRA}`).eq("id", cid ?? "").single();
      // Si la app se publicó antes de correr una migración nueva, seguimos sin esas columnas en vez de rompernos.
      if (full.error && /does not exist/i.test(String((full.error as { message?: string }).message))) {
        const base = must<Omit<Community, "home_name" | "home_lat" | "home_lng">>(
          await supabase.from("communities").select(COMMUNITY_BASE).eq("id", cid ?? "").single()
        );
        return { ...base, home_name: null, home_lat: null, home_lng: null } as Community;
      }
      return must<Community>(full);
    }
  });
}

export function useMembers(cid: string) {
  return useQuery({
    queryKey: keys.members(cid),
    queryFn: async () =>
      must<MemberWithProfile[]>(
        await supabase
          .from("memberships")
          .select("*, profile:profiles!memberships_user_id_fkey(id, full_name, nickname, avatar_url)")
          .eq("community_id", cid)
          .in("status", ["activo", "pendiente"])
          .order("requested_at")
      )
  });
}

/** Teléfonos visibles para mí (RLS filtra: solo miembros activos de mi comunidad). */
export function usePhones(cid: string, userIds: string[]) {
  return useQuery({
    queryKey: [...keys.phones(cid), userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const rows = must<{ user_id: string; phone: string | null }[]>(
        await supabase.from("profile_contacts").select("user_id, phone").in("user_id", userIds)
      );
      // Objeto común (no Map) para poder guardarlo y verlo sin señal.
      return Object.fromEntries(rows.map((r) => [r.user_id, r.phone])) as Record<string, string | null>;
    }
  });
}

export function useInviteCode(cid: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.inviteCode(cid),
    enabled,
    queryFn: async () => must<string>(await supabase.rpc("get_invite_code", { p_community_id: cid }))
  });
}

export function usePendingCommunities(enabled: boolean) {
  return useQuery({
    queryKey: keys.pendingCommunities,
    enabled,
    queryFn: async () =>
      must<(Community & { creator: { full_name: string; nickname: string | null } | null })[]>(
        await supabase
          .from("communities")
          .select(
            "id, name, scout_group, city, timezone, status, created_by, created_at, creator:profiles!communities_created_by_fkey(full_name, nickname)"
          )
          .eq("status", "pendiente")
          .order("created_at")
      )
  });
}

/** Mutación genérica sobre una RPC que, al terminar, refresca las consultas indicadas. */
export function useRpc<A extends Record<string, unknown>, R = unknown>(fn: string, invalidate: readonly (readonly unknown[])[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: A) => must<R>(await supabase.rpc(fn, args)),
    onSuccess: async () => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
    }
  });
}

export type ReviewMembershipArgs = { p_membership_id: string; p_approve: boolean };
export type SetRoleArgs = { p_membership_id: string; p_role: MemberRole };
