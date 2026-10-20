import { useEffect, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

export const CACHE_KEY = "fogon.cache";
const SYNC_KEY = "fogon.ultimaSync";
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // una semana

/** Guarda lo que se vio en el celular para poder leerlo sin señal (por ejemplo, en un campamento). */
export const persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? safeStorage() : undefined,
  key: CACHE_KEY,
  throttleTime: 2000
});

function safeStorage(): Storage | undefined {
  try {
    const t = "__fogon";
    window.localStorage.setItem(t, t);
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    return undefined; // modo privado: la app funciona igual, solo que sin guardar
  }
}

/** Anota la hora de la última vez que se trajeron datos frescos. */
export function trackLastSync(qc: QueryClient) {
  return qc.getQueryCache().subscribe((e) => {
    if (e.type === "updated" && e.action.type === "success") {
      try {
        localStorage.setItem(SYNC_KEY, String(Date.now()));
      } catch {
        /* nada */
      }
    }
  });
}

export function lastSync(): Date | null {
  try {
    const v = Number(localStorage.getItem(SYNC_KEY));
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

/** Borra lo guardado (al cerrar sesión, para que otra persona en el mismo celular no lo vea). */
export function clearOfflineCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(SYNC_KEY);
  } catch {
    /* nada */
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
