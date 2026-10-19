import { useState, type FormEvent } from "react";
import { Button, Card, ErrorBox, Field, SectionTitle, useToast } from "../../components/ui.tsx";
import { keys, useRpc } from "../../lib/queries.ts";
import { clearInviteCode, savedInviteCode } from "../../lib/invite.ts";
import { errorMessage } from "../../lib/supabase.ts";
import type { Membership } from "../../lib/types.ts";
import { signOut } from "../auth/AuthProvider.tsx";

/** Para quien todavía no es miembro activo de ninguna comunidad. */
export function OnboardingScreen({ uid, memberships, name }: { uid: string; memberships: Membership[]; name: string }) {
  const pending = memberships.filter((m) => m.status === "pendiente");
  const rejected = memberships.some((m) => m.status === "rechazado");
  const [mode, setMode] = useState<"join" | "create">("join");

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-accent">Hola, {name}</p>
        <h1 className="font-display text-3xl font-extrabold">Sumate a tu comunidad</h1>
      </div>

      {pending.length > 0 ? (
        <Card className="flex flex-col gap-1 p-4">
          <strong>Solicitud enviada</strong>
          <p className="text-[15px] text-muted">
            Ya pediste entrar {pending.length > 1 ? `a ${pending.length} comunidades` : "a una comunidad"}. Cuando quien coordina te
            apruebe, vas a ver todo acá. Podés cerrar la app tranquilo.
          </p>
        </Card>
      ) : null}
      {rejected && pending.length === 0 ? (
        <ErrorBox message="Tu última solicitud fue rechazada. Si fue un error, pedile a quien coordina un código nuevo." />
      ) : null}

      <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-line/60 p-1.5" role="tablist">
        {(["join", "create"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-xl px-2 py-2.5 text-[15px] font-bold ${mode === m ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
          >
            {m === "join" ? "Tengo un código" : "Sumar mi comunidad"}
          </button>
        ))}
      </div>

      {mode === "join" ? <JoinForm uid={uid} /> : <CreateForm uid={uid} />}

      <Button variant="ghost" onClick={() => void signOut()}>
        Salir
      </Button>
    </main>
  );
}

function JoinForm({ uid }: { uid: string }) {
  const toast = useToast();
  const [code, setCode] = useState(savedInviteCode);
  const join = useRpc<{ p_code: string }, string>("join_community", [keys.myMemberships(uid)]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    join.mutate(
      { p_code: code },
      { onSuccess: (status) => { clearInviteCode(); toast(status === "activo" ? "Ya sos parte de esta comunidad." : "Listo. Ahora falta que te aprueben."); } }
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <SectionTitle>Unirme con un código</SectionTitle>
      <Field
        id="code"
        label="Código de invitación"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCD-1234"
        autoCapitalize="characters"
        autoComplete="off"
        hint="Te lo pasa quien coordina tu comunidad."
        error={join.error ? errorMessage(join.error) : null}
      />
      <Button type="submit" variant="primary" loading={join.isPending} disabled={!code.trim()}>
        Pedir entrar
      </Button>
    </form>
  );
}

function CreateForm({ uid }: { uid: string }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", group: "", city: "" });
  const [touched, setTouched] = useState(false);
  const create = useRpc<{ p_name: string; p_scout_group: string; p_city: string }, string>("request_community", [keys.myMemberships(uid)]);
  const err = (v: string, label: string) => (touched && v.trim().length < 2 ? `Completá ${label}.` : null);

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if ([form.name, form.group, form.city].some((v) => v.trim().length < 2)) return;
    create.mutate(
      { p_name: form.name, p_scout_group: form.group, p_city: form.city },
      { onSuccess: () => toast("Solicitud enviada. Te avisamos cuando esté aprobada.") }
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <SectionTitle>Sumar una comunidad nueva</SectionTitle>
      <p className="text-[14.5px] text-muted">
        Si tu comunidad todavía no usa Fogón, pedila acá. Vas a quedar como coordinador y vas a poder invitar al resto cuando esté
        aprobada.
      </p>
      <Field id="c_name" label="Nombre de la comunidad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Comunidad Rover Los Andes" error={err(form.name, "el nombre")} />
      <Field id="c_group" label="Grupo scout" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} placeholder="Grupo Scout N.º 123" error={err(form.group, "el grupo")} />
      <Field id="c_city" label="Ciudad" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Córdoba" error={err(form.city, "la ciudad")} />
      {create.error ? <ErrorBox message={errorMessage(create.error)} /> : null}
      <Button type="submit" variant="primary" loading={create.isPending}>
        Pedir la comunidad
      </Button>
    </form>
  );
}
