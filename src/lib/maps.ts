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

/**
 * Buscar lugares por nombre (OpenStreetMap / Nominatim, gratis y sin clave).
 * Se llama solo cuando el usuario toca "Buscar", como pide su política de uso.
 */
export async function searchPlaces(query: string, near?: LatLng | null): Promise<Place[]> {
  const params = new URLSearchParams({ format: "jsonv2", q: query, limit: "6", "accept-language": "es", countrycodes: "ar", addressdetails: "0" });
  if (near) {
    // Prioriza resultados cerca (sin excluir los demás).
    const d = 1.5;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("No se pudo buscar el lugar. Probá de nuevo en un momento.");
  const rows = (await res.json()) as { name?: string; display_name: string; lat: string; lon: string }[];
  return rows.map((r) => {
    const parts = r.display_name.split(", ");
    return {
      name: r.name || parts[0] || r.display_name,
      detail: parts.slice(r.name ? 1 : 1, 4).join(", "),
      lat: Number(r.lat),
      lng: Number(r.lon)
    };
  });
}

/** Centro por defecto del mapa: Córdoba capital. */
export const DEFAULT_CENTER: LatLng = { lat: -31.4167, lng: -64.1833 };
