// Tipos escritos a mano a partir de supabase/migrations.
// TODO: reemplazar por `supabase gen types typescript` cuando esté el CLI configurado.

export type MemberRole = "rover" | "coordinador" | "educador";
export type MembershipStatus = "pendiente" | "activo" | "rechazado" | "baja";
export type CommunityStatus = "pendiente" | "activa" | "rechazada";

export interface Profile {
  id: string;
  full_name: string;
  nickname: string | null;
  avatar_url: string | null;
  is_superadmin: boolean;
  privacy_accepted_at: string | null;
  anonymized_at: string | null;
}

export interface Community {
  id: string;
  name: string;
  scout_group: string;
  city: string;
  timezone: string;
  status: CommunityStatus;
  created_by: string;
  created_at: string;
}

export interface Membership {
  id: string;
  community_id: string;
  user_id: string;
  role: MemberRole;
  status: MembershipStatus;
  requested_at: string;
  joined_at: string | null;
}

export type MemberWithProfile = Membership & {
  profile: Pick<Profile, "id" | "full_name" | "nickname" | "avatar_url"> | null;
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  rover: "Rover",
  coordinador: "Coordinador",
  educador: "Educador"
};

export function displayName(p: { full_name: string; nickname: string | null } | null | undefined): string {
  if (!p) return "Sin nombre";
  return p.nickname?.trim() || p.full_name.trim() || "Sin nombre";
}

export function initials(p: { full_name: string; nickname: string | null } | null | undefined): string {
  return displayName(p).slice(0, 2).toUpperCase();
}
