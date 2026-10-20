/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Sin señal: cualquier pantalla de la app (/actividades/…, /calendario…) abre desde lo guardado.
// /a/ y /p/ son las vistas previas de WhatsApp y /api/ las funciones: esas no.
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//, /^\/a\//, /^\/p\//] }));

// Tipografías de Google: se guardan la primera vez para que la app se vea igual sin señal.
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({ cacheName: "fuentes-css" })
);
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({ cacheName: "fuentes", plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 })] })
);

/** Formato que manda la Edge Function "push". */
type PushPayload = { title: string; body: string; url?: string; tag?: string };

self.addEventListener("push", (event) => {
  let data: PushPayload = { title: "Fogón", body: "Tenés una novedad en tu comunidad." };
  try {
    if (event.data) data = { ...data, ...(event.data.json() as Partial<PushPayload>) };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/pwa-192.png",
      badge: "/badge-96.png",
      tag: data.tag,
      data: { url: data.url ?? "/" }
    })
  );
});

// Al tocar la notificación: enfocar una ventana abierta o abrir una nueva en la URL de la actividad.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data as { url?: string } | null)?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if ("focus" in w) {
          await w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});
