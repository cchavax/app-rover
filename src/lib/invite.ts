const KEY = "fogon.codigo";

/** Guarda el ?codigo= del link de invitación y lo saca de la URL. */
export function rememberInviteCodeFromUrl() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("codigo");
    if (code) {
      localStorage.setItem(KEY, code.toUpperCase());
      url.searchParams.delete("codigo");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  } catch {
    // Sin localStorage (modo privado): el usuario tipea el código a mano.
  }
}

export function savedInviteCode(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearInviteCode() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nada
  }
}
