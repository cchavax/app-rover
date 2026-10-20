import { lastSync, useOnline } from "../lib/offline.ts";

function ago(d: Date): string {
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "numeric" }) + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

/** Aviso fino debajo del encabezado cuando no hay conexión. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  const sync = lastSync();
  return (
    <div role="status" className="flex-none bg-[var(--warn-soft)] px-4 py-2 text-center text-[13px] text-ink">
      <strong>Sin conexión.</strong> {sync ? `Mostrando lo guardado (actualizado ${ago(sync)}).` : "Mostrando lo guardado."} Para responder o editar, necesitás señal.
    </div>
  );
}
