import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Si faltan las variables de entorno mostramos una pantalla de configuración en vez de romper. */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? "http://localhost:54321", anonKey ?? "sin-configurar", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" }
});

/** Convierte cualquier error (de Supabase o no) en un texto para mostrar. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    const msg = (e as { message: string }).message;
    if (msg.includes("permission denied")) return "No tenés permiso para hacer eso.";
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return "Sin conexión. Probá de nuevo cuando tengas señal.";
    return msg;
  }
  return "Algo salió mal. Probá de nuevo.";
}

/**
 * Lanza el error de una respuesta de Supabase para que React Query lo maneje.
 * `data` es unknown a propósito: sin tipos generados, supabase-js infiere mal las
 * relaciones (ej. devuelve arrays para relaciones a-uno). El tipo real lo pasa quien llama.
 */
export function must<T>(res: { data: unknown; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
