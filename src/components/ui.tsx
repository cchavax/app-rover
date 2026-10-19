import { Spinner } from "./Loader.tsx";
export { Loading } from "./Loader.tsx";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-[15px] font-bold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-white",
  secondary: "border border-line bg-surface text-ink",
  danger: "border border-line bg-surface text-accent",
  ghost: "text-accent"
};

export function Button({
  variant = "secondary",
  loading = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? (
        <>
          <Spinner />
          <span>Un momento…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Botón de acción peligrosa: el primer toque pide confirmación, el segundo ejecuta. */
export function ConfirmButton({
  onConfirm,
  confirmLabel = "¿Seguro? Tocá de nuevo",
  children,
  ...rest
}: Omit<Parameters<typeof Button>[0], "onClick"> & { onConfirm: () => void; confirmLabel?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      {...rest}
      variant={armed ? "primary" : rest.variant ?? "danger"}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mx-0.5 mt-2 text-xs font-bold uppercase tracking-widest text-muted">{children}</h2>;
}

export function Field({
  id,
  label,
  error,
  hint,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string | null; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <input
        id={id}
        className="w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-accent"
        aria-invalid={Boolean(error)}
        {...rest}
      />
      {hint && !error ? <span className="text-[13px] text-muted">{hint}</span> : null}
      {error ? <span className="text-[13px] font-bold text-accent">{error}</span> : null}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-accent-soft px-4 py-3 text-[14.5px]" role="alert">
      <p className="flex-1">{message}</p>
      {onRetry ? (
        <Button className="min-h-9 px-3 py-1 text-sm" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (url && !broken)
    return <img src={url} alt="" style={style} className="flex-none rounded-xl object-cover" onError={() => setBroken(true)} referrerPolicy="no-referrer" />;
  return (
    <span style={style} className="grid flex-none place-items-center rounded-xl bg-accent-soft font-display text-sm font-extrabold text-accent">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/* ---------- Avisos breves (toast) ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <div
          role="status"
          className="fixed left-1/2 z-50 max-w-[calc(100%-32px)] -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-[14.5px] text-bg shadow-lg"
          style={{ bottom: "calc(84px + env(safe-area-inset-bottom))" }}
        >
          {msg}
        </div>
      ) : null}
    </ToastCtx.Provider>
  );
}
