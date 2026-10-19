import { must, supabase } from "./supabase.ts";
import { isIOS, isStandalone } from "./pwa.ts";

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Estado actual de las notificaciones en ESTE dispositivo. */
export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function fetchPublicKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("push", { body: { action: "public-key" } });
  if (error) throw error;
  const key = (data as { publicKey?: string } | null)?.publicKey;
  if (!key) throw new Error("El servidor de notificaciones no está configurado todavía.");
  return key;
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  must(
    await supabase.rpc("save_push_subscription", {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys?.p256dh ?? "",
      p_auth: json.keys?.auth ?? "",
      p_user_agent: navigator.userAgent
    })
  );
}

/**
 * Pide permiso y suscribe este dispositivo. Tiene que llamarse directo desde un toque
 * del usuario (iPhone lo exige), por eso la clave pública se trae antes.
 */
export async function enablePush(publicKey: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(publicKey) }));
  await saveSubscription(sub);
  return "on";
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  must(await supabase.rpc("delete_push_subscription", { p_endpoint: sub.endpoint }));
  await sub.unsubscribe();
}

/** Re-guarda la suscripción al abrir la app (el navegador a veces la renueva). */
export async function refreshPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await saveSubscription(sub);
}

export async function sendTestPush(): Promise<void> {
  must(await supabase.rpc("send_test_push"));
  const { error } = await supabase.functions.invoke("push", { body: { action: "process" } });
  if (error) throw error;
}
