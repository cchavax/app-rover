import { useEffect, type ReactNode } from "react";

/** Hoja que sube desde abajo con opciones. Se cierra tocando afuera o con Escape. */
export function Sheet({ title, text, onClose, children }: { title: string; text?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-xl flex-col gap-2.5 overflow-y-auto overscroll-contain rounded-t-3xl bg-surface px-4 pt-5"
        style={{ paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}
      >
        <h3 className="font-display text-xl font-extrabold">{title}</h3>
        {text ? <p className="text-muted">{text}</p> : null}
        {children}
      </div>
    </div>
  );
}
