import { Component, type ReactNode } from "react";
import { clearOfflineCache } from "../lib/offline.ts";

/**
 * Si algo se rompe al dibujar la app, en vez de una pantalla en blanco mostramos
 * qué pasó y un botón que borra lo guardado en el celular y vuelve a cargar.
 */
export class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Fogón se rompió:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-4 px-4 py-10">
        <h1 className="font-display text-3xl font-extrabold">Algo se trabó</h1>
        <p className="text-muted">Fogón tuvo un problema al abrir. Tocá el botón: se borra lo guardado en este celular y se vuelve a cargar todo desde cero. No perdés nada.</p>
        <button
          onClick={() => {
            clearOfflineCache();
            window.location.reload();
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 font-bold text-white"
        >
          Volver a cargar
        </button>
        <p className="text-[12px] text-muted">Detalle: {this.state.error.message}</p>
      </main>
    );
  }
}
