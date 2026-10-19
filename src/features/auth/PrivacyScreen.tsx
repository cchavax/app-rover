import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, ErrorBox } from "../../components/ui.tsx";
import { keys } from "../../lib/queries.ts";
import { errorMessage, supabase } from "../../lib/supabase.ts";
import { signOut } from "./AuthProvider.tsx";

export function PrivacyScreen({ uid }: { uid: string }) {
  const qc = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("profiles").update({ privacy_accepted_at: new Date().toISOString() }).eq("id", uid);
    setSaving(false);
    if (err) return setError(errorMessage(err));
    await qc.invalidateQueries({ queryKey: keys.profile(uid) });
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-8">
      <h1 className="font-display text-3xl font-extrabold">Antes de empezar</h1>
      <Card className="flex flex-col gap-3 p-4 text-[15px] leading-relaxed">
        <p>Fogón guarda tu nombre, tu foto de Google, tu teléfono (si lo cargás), y las actividades a las que vas.</p>
        <p>
          Solo lo ven los miembros aprobados de tu comunidad. El teléfono lo ven únicamente miembros activos. Nadie de otra comunidad ve
          tus datos.
        </p>
        <p>
          Podés borrar tu cuenta cuando quieras desde tu perfil: tu nombre se reemplaza por “Ex miembro” y se borra tu teléfono. Tus
          datos se tratan según la Ley 25.326 de Protección de Datos Personales.
        </p>
      </Card>
      <label className="flex items-start gap-3 text-[15px]">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-5 w-5 accent-accent" />
        Leí cómo se usan mis datos y estoy de acuerdo.
      </label>
      {error ? <ErrorBox message={error} /> : null}
      <Button variant="primary" disabled={!checked} loading={saving} onClick={accept}>
        Aceptar y continuar
      </Button>
      <Button variant="ghost" onClick={() => void signOut()}>
        Salir
      </Button>
    </main>
  );
}
