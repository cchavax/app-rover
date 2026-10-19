import { isStandalone, needsIOSInstall } from "./lib/pwa.ts";

export default function App() {
  const installed = isStandalone();
  const iosHint = needsIOSInstall();

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-5 px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-widest text-accent">Paso 0 · en construcción</p>
      <h1 className="font-display text-4xl font-extrabold leading-tight">Fogón</h1>
      <p className="text-muted">
        Actividades, proyectos y asistencia de tu Comunidad Rover. Si ves esta pantalla, el deploy funciona.
      </p>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">{installed ? "Instalada en este celular" : "Todavía no está instalada"}</h2>
        {installed ? (
          <p className="mt-1 text-sm text-muted">Bien. Así va a poder recibir notificaciones.</p>
        ) : iosHint ? (
          <p className="mt-1 text-sm text-muted">
            En iPhone: tocá <strong>Compartir</strong> en Safari y después <strong>Agregar a inicio</strong>.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">
            En Android: abrí el menú de Chrome (⋮) y elegí <strong>Instalar app</strong>.
          </p>
        )}
      </section>
    </main>
  );
}
