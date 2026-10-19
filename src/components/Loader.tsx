import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/** Fueguito animado: llamas que titilan y chispas que suben. */
export function Campfire({ size = 96 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" className="fogon">
      {/* resplandor */}
      <ellipse cx="60" cy="98" rx="38" ry="8" className="fogon-glow" />
      {/* llamas: tres capas que titilan desfasadas */}
      <g className="fogon-flame fogon-flame-1">
        <path d="M60 22c10 16 26 28 26 50a26 26 0 0 1-52 0c0-12 6-20 12-27 1 9 5 14 9 15-2-14 1-27 5-38z" fill="var(--flame-outer)" />
      </g>
      <g className="fogon-flame fogon-flame-2">
        <path d="M60 44c7 10 16 18 16 32a16 16 0 0 1-32 0c0-8 4-13 8-17 1 6 3 9 6 9-1-9 0-17 2-24z" fill="var(--flame-mid)" />
      </g>
      <g className="fogon-flame fogon-flame-3">
        <path d="M60 64c4 6 9 10 9 18a9 9 0 0 1-18 0c0-5 3-8 5-10 1 3 2 5 3 5 0-5 0-9 1-13z" fill="var(--flame-core)" />
      </g>
      {/* leños */}
      <rect x="28" y="92" width="64" height="10" rx="5" transform="rotate(-12 60 97)" fill="var(--log)" />
      <rect x="28" y="92" width="64" height="10" rx="5" transform="rotate(12 60 97)" fill="var(--log-dark)" />
      {/* chispas */}
      <circle className="fogon-spark fogon-spark-1" cx="52" cy="40" r="2" fill="var(--flame-mid)" />
      <circle className="fogon-spark fogon-spark-2" cx="68" cy="34" r="1.6" fill="var(--flame-core)" />
      <circle className="fogon-spark fogon-spark-3" cx="60" cy="30" r="1.8" fill="var(--flame-outer)" />
    </svg>
  );
}

/** Pantalla de carga. Si tarda, avisa que sigue trabajando. */
export function Loading({ label = "Cargando…" }: { label?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-center" role="status" aria-live="polite">
      <Campfire />
      <p className="font-bold">{label}</p>
      <p className={`max-w-[260px] text-sm text-muted transition-opacity duration-500 ${slow ? "opacity-100" : "opacity-0"}`}>
        Sigue trabajando. Parece que la conexión anda lenta.
      </p>
    </div>
  );
}

/** Círculo que gira, para botones. */
export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Barrita arriba de todo cuando la app está trayendo o guardando datos (solo si tarda más de 300 ms). */
export function ActivityBar() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!busy) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(t);
  }, [busy]);
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 z-50 h-[3px] overflow-hidden transition-opacity duration-300 ${show ? "opacity-100" : "opacity-0"}`}
      style={{ top: "env(safe-area-inset-top)" }}
    >
      <div className="fogon-bar h-full w-1/3 rounded-full bg-accent" />
    </div>
  );
}
