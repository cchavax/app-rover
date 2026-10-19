import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, ErrorBox, SectionTitle, useToast } from "../../components/ui.tsx";
import { disablePush, enablePush, fetchPublicKey, pushState, sendTestPush, type PushState } from "../../lib/push.ts";
import { errorMessage, must, supabase } from "../../lib/supabase.ts";

type Prefs = { nueva: boolean; confirmar: boolean; manana: boolean; cambios: boolean; solicitudes: boolean };
const DEFAULTS: Prefs = { nueva: true, confirmar: true, manana: true, cambios: true, solicitudes: true };

export function NotificationsCard({ uid, isCoord }: { uid: string; isCoord: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [state, setState] = useState<PushState | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushState().then(setState);
    // La clave se trae antes del toque: en iPhone el permiso se tiene que pedir directo desde el botón.
    fetchPublicKey().then(setPublicKey, (e) => setKeyError(errorMessage(e)));
  }, []);

  const prefs = useQuery({
    queryKey: ["notification-prefs", uid],
    queryFn: async () => {
      const rows = must<Prefs[]>(await supabase.from("notification_prefs").select("nueva, confirmar, manana, cambios, solicitudes").eq("user_id", uid));
      return rows[0] ?? DEFAULTS;
    }
  });

  async function setPref(key: keyof Prefs, value: boolean) {
    try {
      must(await supabase.rpc("set_notification_prefs", { p_prefs: { [key]: value } }));
      await qc.invalidateQueries({ queryKey: ["notification-prefs", uid] });
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const s = await enablePush(publicKey);
      setState(s);
      toast(s === "on" ? "Listo, las notificaciones están activadas." : s === "denied" ? "Las bloqueaste. Mirá abajo cómo volver a activarlas." : "No se activaron.");
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const items: [keyof Prefs, string][] = [
    ["nueva", "Actividades nuevas"],
    ["confirmar", "Recordarme confirmar (2 días antes)"],
    ["manana", "Recordatorio el día anterior si voy"],
    ["cambios", "Cambios y cancelaciones de lo que voy"],
    ...(isCoord ? ([["solicitudes", "Pedidos para unirse a la comunidad"]] as [keyof Prefs, string][]) : [])
  ];

  return (
    <>
      <SectionTitle>Notificaciones</SectionTitle>
      <Card className="flex flex-col gap-3 p-4">
        {state === null ? <p className="text-muted">Revisando…</p> : null}

        {state === "needs-install" ? (
          <>
            <p className="font-bold">Primero instalá Fogón en tu iPhone</p>
            <p className="text-[14.5px] text-muted">
              En iPhone las notificaciones solo funcionan con la app instalada. En Safari tocá <strong>Compartir</strong> → <strong>Agregar a inicio</strong>,
              abrí Fogón desde el ícono y volvé a esta pantalla.
            </p>
          </>
        ) : null}

        {state === "unsupported" ? <p className="text-[14.5px] text-muted">Este navegador no permite notificaciones. Probá desde Chrome (Android) o con la app instalada (iPhone).</p> : null}

        {state === "denied" ? (
          <>
            <p className="font-bold">Las notificaciones están bloqueadas</p>
            <p className="text-[14.5px] text-muted">
              Para volver a activarlas: en iPhone, Ajustes → Notificaciones → Fogón. En Android, mantené apretado el ícono de Fogón → Información de la app → Notificaciones.
            </p>
          </>
        ) : null}

        {state === "off" ? (
          <>
            <p className="text-[15px]">Activalas para enterarte de actividades nuevas y que te recuerde confirmar.</p>
            {keyError ? <ErrorBox message={keyError} /> : null}
            <Button variant="primary" loading={busy} disabled={!publicKey} onClick={() => void turnOn()}>
              Activar notificaciones
            </Button>
          </>
        ) : null}

        {state === "on" ? (
          <>
            <div className="flex flex-col">
              {items.map(([k, label], i) => (
                <label key={k} className={`flex items-center gap-3 py-3 text-[15px] ${i ? "border-t border-line" : ""}`}>
                  <span className="flex-1">{label}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={(prefs.data ?? DEFAULTS)[k]}
                    onChange={(e) => void setPref(k, e.target.checked)}
                    className="h-6 w-11 cursor-pointer appearance-none rounded-full bg-line transition before:block before:h-5 before:w-5 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-surface before:shadow before:transition checked:bg-[var(--ok)] checked:before:translate-x-[22px]"
                  />
                </label>
              ))}
            </div>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await sendTestPush();
                  toast("Enviada. Si tenés la app abierta, cerrala para verla llegar.");
                } catch (e) {
                  toast(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Mandarme una de prueba
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await disablePush();
                  setState("off");
                  toast("Desactivadas en este dispositivo.");
                } catch (e) {
                  toast(errorMessage(e));
                }
              }}
            >
              Desactivar en este dispositivo
            </Button>
          </>
        ) : null}
      </Card>
    </>
  );
}
