/** Detecta si la app corre instalada (pantalla de inicio) o dentro del navegador. */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

/** iPhone/iPad, incluido el iPad que se presenta como Mac. */
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/** En iOS las notificaciones push solo funcionan con la app instalada. */
export function needsIOSInstall(): boolean {
  return isIOS() && !isStandalone();
}
