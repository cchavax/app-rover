import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, Button, Card, ConfirmButton, ErrorBox, Field, SectionTitle, useToast } from "../../components/ui.tsx";
import { isStandalone, needsIOSInstall } from "../../lib/pwa.ts";
import { keys, useRpc } from "../../lib/queries.ts";
import { errorMessage, must, supabase } from "../../lib/supabase.ts";
import { ROLE_LABEL, displayName, type Community, type MemberRole, type Profile } from "../../lib/types.ts";
import { signOut } from "../auth/AuthProvider.tsx";

export function ProfileScreen({ profile, community, myRole }: { profile: Profile; community: Community; myRole: MemberRole }) {
  const toast = useToast();
  const qc = useQueryClient();
  const phone = useQuery({
    queryKey: ["my-phone", profile.id],
    queryFn: async () =>
      must<{ phone: string | null }>(await supabase.from("profile_contacts").select("phone").eq("user_id", profile.id).single()).phone
  });
  const [form, setForm] = useState({ full_name: profile.full_name, nickname: profile.nickname ?? "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phone.data !== undefined) setForm((f) => ({ ...f, phone: phone.data ?? "" }));
  }, [phone.data]);

  const leave = useRpc<{ p_community_id: string }>("leave_community", [keys.myMemberships(profile.id)]);
  const deleteAccount = useRpc<Record<string, never>>("delete_my_account", []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.full_name.trim().length < 2) return setError("Poné tu nombre.");
    const tel = form.phone.trim();
    if (tel && !/^[0-9 +()-]{6,25}$/.test(tel)) return setError("El teléfono solo puede tener números, espacios, +, ( ) y guiones.");
    setSaving(true);
    const a = await supabase.from("profiles").update({ full_name: form.full_name.trim(), nickname: form.nickname.trim() || null }).eq("id", profile.id);
    const b = await supabase.from("profile_contacts").update({ phone: tel || null }).eq("user_id", profile.id);
    setSaving(false);
    const err = a.error ?? b.error;
    if (err) return setError(errorMessage(err));
    await qc.invalidateQueries({ queryKey: keys.profile(profile.id) });
    await qc.invalidateQueries({ queryKey: ["my-phone", profile.id] });
    await qc.invalidateQueries({ queryKey: keys.members(community.id) });
    toast("Perfil guardado.");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center gap-4 p-4">
        <Avatar name={displayName(profile)} url={profile.avatar_url} size={56} />
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl font-extrabold">{displayName(profile)}</h2>
          <p className="text-sm text-muted">
            {ROLE_LABEL[myRole]} · {community.name}
          </p>
        </div>
      </Card>

      <SectionTitle>Mis datos</SectionTitle>
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <Field id="p_name" label="Nombre" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoComplete="name" />
        <Field id="p_nick" label="Apodo (opcional)" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} hint="Si lo cargás, es como te ve la comunidad." />
        <Field id="p_phone" label="Teléfono (opcional)" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="351 555 1234" hint="Solo lo ven los miembros activos de tu comunidad." autoComplete="tel" />
        {error ? <ErrorBox message={error} /> : null}
        <Button type="submit" variant="primary" loading={saving}>
          Guardar
        </Button>
      </form>

      {!isStandalone() ? (
        <Card className="p-4 text-[14.5px]">
          <strong>Instalá Fogón en tu celular.</strong>{" "}
          {needsIOSInstall()
            ? "En Safari tocá Compartir y después “Agregar a inicio”. En iPhone es la única forma de recibir notificaciones."
            : "Abrí el menú del navegador (⋮) y elegí “Instalar app”."}
        </Card>
      ) : null}

      <SectionTitle>Cuenta</SectionTitle>
      <Card className="flex flex-col gap-2 p-3">
        <Button onClick={() => void signOut()}>Cerrar sesión</Button>
        <ConfirmButton
          loading={leave.isPending}
          confirmLabel={`¿Salir de ${community.name}?`}
          onConfirm={() => leave.mutate({ p_community_id: community.id }, { onError: (e) => toast(errorMessage(e)) })}
        >
          Salir de la comunidad
        </ConfirmButton>
        <ConfirmButton
          loading={deleteAccount.isPending}
          confirmLabel="Se borra tu nombre y teléfono. ¿Seguro?"
          onConfirm={() =>
            deleteAccount.mutate({}, { onSuccess: () => void signOut(), onError: (e) => toast(errorMessage(e)) })
          }
        >
          Borrar mi cuenta
        </ConfirmButton>
        <p className="px-1 text-[13px] text-muted">
          Al borrar tu cuenta tu nombre pasa a ser “Ex miembro” y se borra tu teléfono. Las actividades que creaste quedan para la
          comunidad.
        </p>
      </Card>
    </div>
  );
}
