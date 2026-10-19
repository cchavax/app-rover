// Mapa para elegir la ubicación exacta: buscar por nombre, tocar el mapa o arrastrar el pin.
// Se carga solo cuando se abre (Leaflet pesa), con React.lazy desde el formulario.
import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Spinner } from "./Loader.tsx";
import { DEFAULT_CENTER, searchPlaces, type LatLng, type Place } from "../lib/maps.ts";

type Props = {
  value: LatLng | null;
  onChange: (v: LatLng | null) => void;
  /** Se llama al elegir una sugerencia: reemplaza el texto del lugar por el nombre elegido. */
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

  // Si el valor cambia desde afuera (ej. "Usar la sede"), movemos el pin y el mapa.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const cur = marker.current?.getLatLng();
    if (!cur || Math.abs(cur.lat - value.lat) > 1e-7 || Math.abs(cur.lng - value.lng) > 1e-7) {
      putMarker(value);
      m.setView([value.lat, value.lng], Math.max(m.getZoom(), 16));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  // Búsqueda automática mientras se escribe (con una pausa para no buscar en cada letra).
  // No busca si el texto vino de elegir una sugerencia o la sede (el pin ya está puesto).
  const lastPicked = useRef<string | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || q === lastPicked.current) {
      setResults(null);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const t = setTimeout(async () => {
      // El texto pudo venir de la sede o de abrir una actividad ya ubicada: no sugerimos nada.
      if (q === lastPicked.current) {
        setSearching(false);
        return;
      }
      try {
        const rows = await searchPlaces(q, value ?? DEFAULT_CENTER, ctrl.signal);
        setResults(rows);
        setError(rows.length ? null : "No encontré ese lugar. Probá con otro nombre o tocá el mapa.");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("No se pudo buscar ahora. Podés tocar el mapa para poner el pin.");
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Si el pin se puso con la sede o desde afuera, no mostramos sugerencias para ese texto.
  useEffect(() => {
    if (value && query.trim()) lastPicked.current = query.trim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

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
      {searching && !results ? (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner size={14} /> Buscando “{query.trim()}”…
        </p>
      ) : null}

      {results && results.length ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {results.map((r, i) => (
            <button
              type="button"
              key={`${r.lat},${r.lng},${i}`}
              onClick={() => {
                lastPicked.current = r.name;
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
          {value ? "Arrastrá el pin o tocá el mapa para ajustarlo." : "Escribí el lugar arriba y elegí una sugerencia, o tocá el mapa."}
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
