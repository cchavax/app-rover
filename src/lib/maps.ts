export type LatLng = { lat: number; lng: number };

export const coordsOf = (a: { location_lat: number | null; location_lng: number | null }): LatLng | null =>
  a.location_lat != null && a.location_lng != null ? { lat: a.location_lat, lng: a.location_lng } : null;

/** Vista de Google Maps embebida (sin clave): por coordenadas o por el texto del lugar. */
export function embedUrl(location: string | null, coords: LatLng | null): string | null {
  const q = coords ? `${coords.lat},${coords.lng}` : location?.trim();
  return q ? `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed` : null;
}

/** Link para abrir Google Maps: con pin, indicaciones al punto exacto; si no, búsqueda por el lugar. */
export function directionsUrl(location: string | null, coords: LatLng | null): string | null {
  if (coords) return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
  if (location?.trim()) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
  return null;
}

export type Place = { name: string; detail: string; lat: number; lng: number };

// Argentina (oeste, sur, este, norte): limita las sugerencias al país.
const AR_BBOX = "-73.6,-55.1,-53.6,-21.8";

/**
 * Sugerencias de lugares mientras se escribe (Photon, sobre datos de OpenStreetMap).
 * Photon está pensado para buscar al tipear; Nominatim no lo permite en su política de uso.
 */
export async function searchPlaces(query: string, near?: LatLng | null, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: "6", bbox: AR_BBOX });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!res.ok) throw new Error("No se pudo buscar el lugar. Probá de nuevo en un momento.");
  type Feature = {
    geometry: { coordinates: [number, number] };
    properties: { name?: string; street?: string; housenumber?: string; district?: string; city?: string; county?: string; state?: string };
  };
  const data = (await res.json()) as { features: Feature[] };
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const f of data.features) {
    const p = f.properties;
    const street = p.street ? `${p.street}${p.housenumber ? " " + p.housenumber : ""}` : null;
    const name = p.name || street || p.city || "Lugar sin nombre";
    const detail = [p.name ? street : null, p.district, p.city, p.state].filter((x, i, arr) => x && x !== name && arr.indexOf(x) === i).join(", ");
    const key = `${name}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, detail, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });
  }
  return out;
}

/** Centro por defecto del mapa: Córdoba capital. */
export const DEFAULT_CENTER: LatLng = { lat: -31.4167, lng: -64.1833 };
