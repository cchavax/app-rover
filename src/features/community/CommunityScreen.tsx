import { useState } from "react";
import { Sheet } from "../../components/Sheet.tsx";
import { HomeCard } from "./HomeCard.tsx";
import { Avatar, Button, Card, ConfirmButton, ErrorBox, Loading, SectionTitle, useToast } from "../../components/ui.tsx";
import { keys, useInviteCode, useMembers, usePhones, useRpc, type ReviewMembershipArgs, type SetRoleArgs } from "../../lib/queries.ts";
import { errorMessage } from "../../lib/supabase.ts";
import { ROLE_LABEL, displayName, type Community, type MemberRole, type MemberWithProfile } from "../../lib/types.ts";

const ROLE_ORDER: Record<MemberRole, number> = { coordinador: 0, rover: 1, educador: 2 };

export function CommunityScreen({ community, myRole, uid }: { community: Community; myRole: MemberRole; uid: string }) {
  const isCoord = myRole === "coordinador";
  const members = useMembers(community.id);
  const active = (members.data ?? []).filter((m) => m.status === "activo");
  const pending = (members.data ?? []).filter((m) => m.status === "pendiente");
  const phones = usePhones(community.id, active.map((m) => m.user_id));
  const [openId, setOpenId] = useState<string | null>(null);
  const openMember = active.find((m) => m.id === openId);

  if (members.isLoading) return <Loading />;
  if (members.error && !members.data) return <ErrorBox message={errorMessage(members.error)} onRetry={() => void members.refetch()} />;

  const sorted = [...active].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || displayName(a.profile).localeCompare(displayName(b.profile))
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <h2 className="font-display text-xl font-extrabold">{community.name}</h2>
        <p className="text-sm text-muted">
          {community.scout_group} · {community.city}
        </p>
      </Card>

      <HomeCard community={community} isCoord={isCoord} />
      {isCoord ? <InviteCard community={community} /> : null}
      {isCoord && pending.length > 0 ? <PendingRequests cid={community.id} pending={pending} /> : null}

      <SectionTitle>Miembros ({active.length})</SectionTitle>
      <Card>
        {sorted.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setOpenId(m.id)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left ${i ? "border-t border-line" : ""}`}
          >
            <Avatar name={displayName(m.profile)} url={m.profile?.avatar_url} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">
                {displayName(m.profile)} {m.user_id === uid ? <span className="text-sm font-normal text-muted">(vos)</span> : null}
              </span>
              {phones.data?.[m.user_id] ? <span className="block text-sm text-muted">{phones.data[m.user_id]}</span> : null}
            </span>
            <span className="rounded-full bg-line/60 px-2.5 py-1 text-xs font-bold text-muted">{ROLE_LABEL[m.role]}</span>
            <span className="text-muted" aria-hidden="true">›</span>
          </button>
        ))}
      </Card>
      {openMember ? (
        <MemberSheet
          m={openMember}
          isCoord={isCoord}
          isMe={openMember.user_id === uid}
          phone={phones.data?.[openMember.user_id] ?? null}
          cid={community.id}
          heirs={sorted.filter((x) => x.user_id !== openMember.user_id && x.role !== "educador")}
          onClose={() => setOpenId(null)}
        />
      ) : null}
      {isCoord ? (
        <p className="text-[13px] text-muted">
          Siempre tiene que quedar al menos un coordinador. Cuando alguien se va, sus actividades y su historial se conservan.
        </p>
      ) : null}
    </div>
  );
}

function InviteCard({ community }: { community: Community }) {
  const toast = useToast();
  const code = useInviteCode(community.id, true);
  const regen = useRpc<{ p_community_id: string }, string>("regenerate_invite_code", [keys.inviteCode(community.id)]);
  const link = `${window.location.origin}/?codigo=${code.data ?? ""}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(
    `Sumate a ${community.name} en Fogón: ${link}\nCódigo: ${code.data ?? ""}`
  )}`;

  return (
    <>
      <SectionTitle>Invitar</SectionTitle>
      <Card className="flex flex-col gap-3 p-4">
        <span className="font-mono text-2xl font-bold tracking-[.12em]">{code.data ?? "…"}</span>
        <p className="text-[13.5px] text-muted">Compartilo con quien se quiera sumar. Igual vas a tener que aprobarlo.</p>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[#1f8f4e] px-4 font-bold text-white" href={wa} target="_blank" rel="noopener">
            Mandar por WhatsApp
          </a>
          <Button
            className="flex-1"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code.data ?? "");
                toast("Código copiado.");
              } catch {
                toast("No se pudo copiar. Mantené apretado el código.");
              }
            }}
          >
            Copiar
          </Button>
        </div>
        <ConfirmButton
          variant="ghost"
          loading={regen.isPending}
          confirmLabel="El código actual deja de servir. ¿Seguro?"
          onConfirm={() => regen.mutate({ p_community_id: community.id }, { onSuccess: () => toast("Código nuevo generado.") })}
        >
          Generar otro código
        </ConfirmButton>
      </Card>
    </>
  );
}

function PendingRequests({ cid, pending }: { cid: string; pending: MemberWithProfile[] }) {
  const toast = useToast();
  const review = useRpc<ReviewMembershipArgs>("review_membership", [keys.members(cid)]);
  return (
    <>
      <SectionTitle>Quieren unirse ({pending.length})</SectionTitle>
      <Card>
        {pending.map((m, i) => (
          <div key={m.id} className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-line" : ""}`}>
            <Avatar name={displayName(m.profile)} url={m.profile?.avatar_url} size={36} />
            <span className="min-w-0 flex-1 truncate font-bold">{displayName(m.profile)}</span>
            <Button className="min-h-9 px-3 py-1 text-sm" disabled={review.isPending} onClick={() => review.mutate({ p_membership_id: m.id, p_approve: false }, { onSuccess: () => toast("Solicitud rechazada.") })}>
              Rechazar
            </Button>
            <Button variant="primary" className="min-h-9 px-3 py-1 text-sm" disabled={review.isPending} onClick={() => review.mutate({ p_membership_id: m.id, p_approve: true }, { onSuccess: () => toast(`${displayName(m.profile)} ya es parte de la comunidad.`) })}>
              Aprobar
            </Button>
          </div>
        ))}
      </Card>
      {review.error ? <ErrorBox message={errorMessage(review.error)} /> : null}
    </>
  );
}

function MemberSheet({
  m,
  isCoord,
  isMe,
  phone,
  cid,
  heirs,
  onClose
}: {
  m: MemberWithProfile;
  isCoord: boolean;
  isMe: boolean;
  phone: string | null;
  cid: string;
  heirs: MemberWithProfile[];
  onClose: () => void;
}) {
  const toast = useToast();
  const setRole = useRpc<SetRoleArgs>("set_member_role", [keys.members(cid)]);
  const remove = useRpc<{ p_membership_id: string }>("remove_member", [keys.members(cid)]);
  const transfer = useRpc<{ p_community_id: string; p_from: string; p_to: string }, number>("transfer_ownership", [["activities"], ["projects"]]);
  const [heir, setHeir] = useState("");
  const name = displayName(m.profile);
  const digits = phone?.replace(/\D/g, "") ?? "";

  return (
    <Sheet title={name} onClose={onClose}>
      <div className="flex items-center gap-3">
        <Avatar name={name} url={m.profile?.avatar_url} size={52} />
        <div className="min-w-0">
          <p className="font-bold">{ROLE_LABEL[m.role]}{isMe ? " · vos" : ""}</p>
          {phone ? <p className="text-sm text-muted">{phone}</p> : <p className="text-sm text-muted">Sin teléfono cargado</p>}
        </div>
      </div>

      {phone && !isMe ? (
        <a href={`https://wa.me/${digits.startsWith("54") ? digits : "549" + digits}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1f8f4e] px-4 font-bold text-white">
          Escribirle por WhatsApp
        </a>
      ) : null}

      {isCoord ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="m_role" className="text-sm font-bold">Rol</label>
          <select
            id="m_role"
            value={m.role}
            disabled={setRole.isPending}
            onChange={(e) =>
              setRole.mutate(
                { p_membership_id: m.id, p_role: e.target.value as MemberRole },
                {
                  onSuccess: () => toast(`${name} ahora es ${ROLE_LABEL[e.target.value as MemberRole].toLowerCase()}.`),
                  onError: (err) => toast(errorMessage(err))
                }
              )
            }
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-base"
          >
            {(Object.keys(ROLE_LABEL) as MemberRole[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
      ) : null}

      {isCoord && !isMe && heirs.length ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="m_heir" className="text-sm font-bold">Pasar sus actividades y proyectos a</label>
          <div className="flex gap-2">
            <select id="m_heir" value={heir} onChange={(e) => setHeir(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-base">
              <option value="">Elegí a quién</option>
              {heirs.map((h) => (
                <option key={h.user_id} value={h.user_id}>{displayName(h.profile)}</option>
              ))}
            </select>
            <Button
              disabled={!heir}
              loading={transfer.isPending}
              onClick={() =>
                transfer.mutate(
                  { p_community_id: cid, p_from: m.user_id, p_to: heir },
                  { onSuccess: (n) => toast(n ? `Listo: ${n} cosas pasaron de dueño.` : `${name} no tenía nada a su nombre.`), onError: (e) => toast(errorMessage(e)) }
                )
              }
            >
              Pasar
            </Button>
          </div>
          <p className="text-[13px] text-muted">Útil cuando alguien egresa o deja la comunidad.</p>
        </div>
      ) : null}

      {isCoord && !isMe ? (
        <ConfirmButton
          confirmLabel={`¿Dar de baja a ${name}?`}
          loading={remove.isPending}
          onConfirm={() =>
            remove.mutate(
              { p_membership_id: m.id },
              { onSuccess: () => { toast(`${name} fue dado de baja.`); onClose(); }, onError: (err) => toast(errorMessage(err)) }
            )
          }
        >
          Dar de baja
        </ConfirmButton>
      ) : null}

      <Button variant="ghost" onClick={onClose}>Cerrar</Button>
    </Sheet>
  );
}
