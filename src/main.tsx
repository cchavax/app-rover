import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import App from "./App.tsx";
import { CrashScreen } from "./components/CrashScreen.tsx";
import { ActivityBar } from "./components/Loader.tsx";
import { ToastProvider } from "./components/ui.tsx";
import { AuthProvider } from "./features/auth/AuthProvider.tsx";
import { rememberInviteCodeFromUrl } from "./lib/invite.ts";
import { CACHE_MAX_AGE, persister, trackLastSync } from "./lib/offline.ts";
import "./index.css";

// Si llegaron por un link de invitación, guardamos el código antes del login con Google.
rememberInviteCodeFromUrl();

const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime largo: lo guardado tiene que durar para verlo sin señal.
    queries: { staleTime: 30_000, gcTime: CACHE_MAX_AGE, retry: 1, refetchOnWindowFocus: true }
  }
});
trackLastSync(queryClient);

/** Solo guardamos datos que sobreviven a JSON (nada de Map, Set ni fechas como objetos). */
function isPlainJson(v: unknown): boolean {
  if (v === null || typeof v !== "object") return true;
  if (v instanceof Map || v instanceof Set || v instanceof Date) return false;
  if (Array.isArray(v)) return v.every(isPlainJson);
  return Object.values(v as Record<string, unknown>).every(isPlainJson);
}

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento #root");

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        // Cambiarlo descarta lo guardado. v2: la v1 guardaba Map (no se puede pasar a JSON) y rompía la app al reabrirla.
        buster: "v2",
        dehydrateOptions: {
          shouldDehydrateQuery: (q) =>
            q.state.status === "success" && q.queryKey[0] !== "invite-code" && isPlainJson(q.state.data)
        }
      }}
    >
      <AuthProvider>
        <ToastProvider>
          <ActivityBar />
          <CrashScreen>
            <App />
          </CrashScreen>
        </ToastProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>
);
