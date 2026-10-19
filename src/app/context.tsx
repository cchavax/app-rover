import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useMembers } from "../lib/queries.ts";
import { displayName, type Community, type MemberRole, type Profile } from "../lib/types.ts";

type AppState = { community: Community; role: MemberRole; profile: Profile };
const Ctx = createContext<AppState | null>(null);

export function AppProvider({ value, children }: { value: AppState; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Comunidad, rol y perfil actuales. Solo se usa dentro de pantallas de una comunidad. */
export function useApp(): AppState & { canCreate: boolean; isCoord: boolean; tz: string } {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fuera de AppProvider");
  return { ...v, canCreate: v.role !== "educador", isCoord: v.role === "coordinador", tz: v.community.timezone };
}

/** Nombres de los miembros (activos y pendientes) por id, para mostrar autores y responsables. */
export function useMemberNames() {
  const { community } = useApp();
  const members = useMembers(community.id);
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const m of members.data ?? []) names.set(m.user_id, displayName(m.profile));
    return {
      name: (id: string) => names.get(id) ?? "Ex miembro",
      members: members.data ?? []
    };
  }, [members.data]);
}
