import { useState } from "react";
import { Button, ErrorBox } from "../../components/ui.tsx";
import { errorMessage } from "../../lib/supabase.ts";
import { signInWithGoogle } from "./AuthProvider.tsx";

export function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <img src="/pwa-192.png" alt="" width={72} height={72} className="rounded-2xl" />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-5xl font-extrabold leading-none">Fogón</h1>
        <p className="text-lg text-muted">Las actividades, los proyectos y la asistencia de tu Comunidad Rover, en un solo lugar.</p>
      </div>
      {error ? <ErrorBox message={error} /> : null}
      <Button
        variant="primary"
        loading={loading}
        className="w-full"
        onClick={async () => {
          setError(null);
          setLoading(true);
          try {
            await signInWithGoogle();
          } catch (e) {
            setError(errorMessage(e));
            setLoading(false);
          }
        }}
      >
        <GoogleIcon /> Entrar con Google
      </Button>
      <p className="text-[13px] text-muted">
        Usamos tu nombre y tu foto de Google para que tu comunidad te reconozca. Nada más.
      </p>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#fff" opacity=".85" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="#fff" opacity=".7" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" />
      <path fill="#fff" opacity=".55" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" />
    </svg>
  );
}
