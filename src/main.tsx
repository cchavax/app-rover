import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import { ActivityBar } from "./components/Loader.tsx";
import { ToastProvider } from "./components/ui.tsx";
import { AuthProvider } from "./features/auth/AuthProvider.tsx";
import { rememberInviteCodeFromUrl } from "./lib/invite.ts";
import "./index.css";

// Si llegaron por un link de invitación, guardamos el código antes del login con Google.
rememberInviteCodeFromUrl();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } }
});

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento #root");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <ActivityBar />
          <App />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
