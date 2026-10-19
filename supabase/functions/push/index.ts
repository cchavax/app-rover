// Fogón · Edge Function "push": envía notificaciones Web Push.
// Archivo único a propósito: se puede pegar tal cual en el editor de Supabase.
// Web Push sin librerías: solo WebCrypto, así corre igual en Deno (Supabase) y en Node (tests).
//   * Cifrado del mensaje: RFC 8291 (aes128gcm).
//   * Autenticación del servidor: VAPID, RFC 8292 (JWT ES256).

const enc = new TextEncoder();

export function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function bytesToB64url(bytes: Uint8Array | ArrayBuffer): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** Par de claves VAPID nuevo: pública en base64url (la usa el navegador) y privada en JWK. */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKeyJwk: JsonWebKey }> {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = await crypto.subtle.exportKey("raw", kp.publicKey);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { publicKey: bytesToB64url(raw), privateKeyJwk: jwk };
}

/**
 * Cifra el mensaje para una suscripción (RFC 8291). `testing` permite fijar la clave efímera
 * y la sal para reproducir el vector de prueba del RFC; en producción se generan al azar.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  uaPublicB64: string,
  authSecretB64: string,
  testing?: { asKeyPair: CryptoKeyPair; salt: Uint8Array }
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(uaPublicB64);
  const authSecret = b64urlToBytes(authSecretB64);
  const salt = testing?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const asKeys =
    testing?.asKeyPair ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const record = concat(plaintext, new Uint8Array([2])); // 0x02 = último (y único) registro
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, record));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/** Encabezado Authorization de VAPID para el servicio de push de esa suscripción. */
export async function vapidAuthorization(endpoint: string, subject: string, publicKey: string, privateKeyJwk: JsonWebKey): Promise<string> {
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }))
  );
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("jwk", privateKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${bytesToB64url(signature)}, k=${publicKey}`;
}

export type Subscription = { endpoint: string; p256dh: string; auth: string };
export type Vapid = { subject: string; publicKey: string; privateKeyJwk: JsonWebKey };

/** Envía un push. Devuelve el status HTTP (201 = ok; 404/410 = la suscripción ya no existe). */
export async function sendPush(sub: Subscription, message: unknown, vapid: Vapid, ttlSeconds = 86400): Promise<number> {
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Urgency: "normal",
      Authorization: await vapidAuthorization(sub.endpoint, vapid.subject, vapid.publicKey, vapid.privateKeyJwk)
    },
    body
  });
  await res.body?.cancel();
  return res.status;
}

// =====================================================================
// Edge Function "push" (Supabase). Acciones:
//   * {"action":"public-key"} → clave pública VAPID (la crea la primera vez).
//   * {"action":"process"}    → envía lo pendiente de la cola. Lo llama pg_cron
//                               (con x-fogon-secret) o la app de un usuario logueado.
// =====================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Config = { public_key: string | null; private_jwk: JsonWebKey | null; subject: string | null; secret: string | null };
type Claimed = { queue_id: number; title: string; body: string; url: string; tag: string; subs: Subscription[] };
// deno-lint-ignore no-explicit-any
type Admin = any;

export async function loadConfig(admin: Admin): Promise<Config> {
  const read = async () => {
    const { data, error } = await admin.rpc("push_config");
    if (error) throw error;
    return data as Config;
  };
  let cfg = await read();
  if (!cfg.public_key || !cfg.private_jwk) {
    const keys = await generateVapidKeys();
    const { error } = await admin.rpc("push_save_keys", { p_public_key: keys.publicKey, p_private_jwk: keys.privateKeyJwk });
    if (error) throw error;
    cfg = await read(); // si dos llamadas compitieron, nos quedamos con la que se guardó
  }
  return cfg;
}

export async function processQueue(admin: Admin, cfg: Config) {
  const vapid: Vapid = {
    subject: cfg.subject ?? "mailto:avisos@fogon.app",
    publicKey: cfg.public_key ?? "",
    privateKeyJwk: cfg.private_jwk ?? {}
  };
  let sent = 0, failed = 0, removed = 0;
  for (let round = 0; round < 5; round++) {
    const { data, error } = await admin.rpc("push_claim_batch", { p_limit: 200 });
    if (error) throw error;
    const batch = (data ?? []) as Claimed[];
    if (!batch.length) break;

    const dead = new Set<string>();
    const jobs = batch.flatMap((m) =>
      m.subs.map((s) => async () => {
        try {
          const status = await sendPush(s, { title: m.title, body: m.body, url: m.url, tag: m.tag }, vapid);
          if (status === 404 || status === 410) dead.add(s.endpoint);
          else if (status >= 200 && status < 300) sent++;
          else failed++;
        } catch {
          failed++;
        }
      })
    );
    // De a 20 envíos en paralelo.
    for (let i = 0; i < jobs.length; i += 20) await Promise.all(jobs.slice(i, i + 20).map((j) => j()));

    removed += dead.size;
    const { error: finishError } = await admin.rpc("push_finish", {
      p_sent: batch.map((m) => m.queue_id),
      p_dead_endpoints: [...dead]
    });
    if (finishError) throw finishError;
  }
  return { sent, failed, removed };
}

// deno-lint-ignore no-explicit-any
const DenoGlobal = (globalThis as any).Deno;
if (DenoGlobal) {
  DenoGlobal.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    try {
      const { createClient } = await import("npm:@supabase/supabase-js@2");
      const admin = createClient(DenoGlobal.env.get("SUPABASE_URL"), DenoGlobal.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { action } = await req.json().catch(() => ({ action: null }));
      const cfg = await loadConfig(admin);

      if (action === "public-key") return json({ publicKey: cfg.public_key });

      if (action === "process") {
        const fromCron = Boolean(cfg.secret) && req.headers.get("x-fogon-secret") === cfg.secret;
        let fromUser = false;
        if (!fromCron) {
          const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
          if (jwt) fromUser = Boolean((await admin.auth.getUser(jwt)).data?.user);
        }
        if (!fromCron && !fromUser) return json({ error: "No autorizado." }, 401);
        return json(await processQueue(admin, cfg));
      }

      return json({ error: "Acción desconocida." }, 400);
    } catch (e) {
      console.error(e);
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });
}
