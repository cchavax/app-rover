import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import App from "./App.tsx";
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

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento #root");

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        buster: "v1", // cambiarlo si cambia la forma de los datos guardados
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && q.queryKey[0] !== "invite-code" }
      }}
    >
      <AuthProvider>
        <ToastProvider>
          <ActivityBar />
          <App />
        </ToastProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>
);
