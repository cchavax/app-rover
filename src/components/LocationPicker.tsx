// Mapa para elegir la ubicación exacta: buscar por nombre, tocar el mapa o arrastrar el pin.
// Se carga solo cuando se abre (Leaflet pesa), con React.lazy desde el formulario.
import { useEffect, useRef, useState, type FormEvent } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Spinner } from "./Loader.tsx";
import { DEFAULT_CENTER, searchPlaces, type LatLng, type Place } from "../lib/maps.ts";

type Props = {
  value: LatLng | null;
  onChange: (v: LatLng | null) => void;
  /** Se llama al elegir un resultado de la búsqueda, para completar el nombre del lugar. */
  onPlaceName: (name: string) => void;
  /** Texto del campo "Lugar": es lo que se busca (no hay un segundo buscador). */
  query: string;
};

const pinIcon = () =>
  L.divIcon({ className: "fogon-pin", html: "<span></span>", iconSize: [30, 30], iconAnchor: [15, 30] });

export default function LocationPicker({ value, onChange, onPlaceName, query }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function putMarker(p: LatLng) {
    const m = map.current;
    if (!m) return;
    if (marker.current) {
      marker.current.setLatLng([p.lat, p.lng]);
    } else {
      const mk = L.marker([p.lat, p.lng], { draggable: true, icon: pinIcon(), autoPan: true });
      mk.on("dragend", () => {
        const ll = mk.getLatLng();
        onChangeRef.current({ lat: ll.lat, lng: ll.lng });
      });
      mk.addTo(m);
      marker.current = mk;
    }
  }

  function place(p: LatLng, zoom?: number) {
    putMarker(p);
    map.current?.setView([p.lat, p.lng], zoom ?? Math.max(map.current.getZoom(), 15));
    onChangeRef.current(p);
  }

  useEffect(() => {
    if (!box.current || map.current) return;
    const start = value ?? DEFAULT_CENTER;
    const m = L.map(box.current, { zoomControl: true }).setView([start.lat, start.lng], value ? 16 : 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      putMarker({ lat: e.latlng.lat, lng: e.latlng.lng });
      onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    map.current = m;
    if (value) putMarker(value);
    // El contenedor puede cambiar de tamaño al abrirse: recalculamos.
    const t = setTimeout(() => m.invalidateSize(), 200);
    return () => {
      clearTimeout(t);
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) return setError("Escribí el nombre del lugar arriba (al menos 3 letras).");
    setSearching(true);
    setError(null);
    try {
      const rows = await searchPlaces(query.trim(), value ?? DEFAULT_CENTER);
      setResults(rows);
      if (!rows.length) setError("No encontré ese lugar. Probá con otro nombre o tocá el mapa.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo buscar.");
    } finally {
      setSearching(false);
    }
  }

  function hereAndNow() {
    if (!("geolocation" in navigator)) return setError("Este celular no comparte la ubicación.");
    navigator.geolocation.getCurrentPosition(
      (pos) => place({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 17),
      () => setError("No pude obtener tu ubicación. Revisá que Fogón tenga permiso."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={(e) => void search(e)}
        disabled={searching || query.trim().length < 3}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-bg px-3.5 font-bold disabled:opacity-50"
      >
        {searching ? <Spinner /> : null}
        {query.trim().length >= 3 ? `Buscar “${query.trim().length > 28 ? query.trim().slice(0, 27) + "…" : query.trim()}” en el mapa` : "Escribí el lugar arriba para buscarlo"}
      </button>

      {results && results.length ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {results.map((r, i) => (
            <button
              type="button"
              key={`${r.lat},${r.lng},${i}`}
              onClick={() => {
                place({ lat: r.lat, lng: r.lng }, 16);
                onPlaceName(r.name);
                setResults(null);
              }}
              className={`block w-full px-3.5 py-2.5 text-left ${i ? "border-t border-line" : ""}`}
            >
              <span className="block font-bold">{r.name}</span>
              <span className="block truncate text-[13px] text-muted">{r.detail}</span>
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-[13px] font-bold text-accent">{error}</p> : null}

      <div ref={box} className="h-60 w-full overflow-hidden rounded-xl border border-line" />
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13px] text-muted">
          {value ? "Arrastrá el pin o tocá el mapa para ajustarlo." : "Buscá el lugar o tocá el mapa para poner el pin."}
        </p>
        <button type="button" onClick={hereAndNow} className="rounded-lg px-2 py-1 text-sm font-bold text-accent">
          Estoy acá
        </button>
        {value ? (
          <button
            type="button"
            onClick={() => {
              marker.current?.remove();
              marker.current = null;
              onChangeRef.current(null);
            }}
            className="rounded-lg px-2 py-1 text-sm font-bold text-muted"
          >
            Quitar pin
          </button>
        ) : null}
      </div>
    </div>
  );
}
