import { Suspense, lazy, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Spinner } from "../../components/Loader.tsx";
import { Button, Card, ErrorBox, Field, SectionTitle, useToast } from "../../components/ui.tsx";
import { directionsUrl, type LatLng } from "../../lib/maps.ts";
import { errorMessage, supabase } from "../../lib/supabase.ts";
import type { Community } from "../../lib/types.ts";

const LocationPicker = lazy(() => import("../../components/LocationPicker.tsx"));

/** Sede de la comunidad: el lugar por defecto de las actividades. La edita un coordinador. */
export function HomeCard({ community, isCoord }: { community: Community; isCoord: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const saved: LatLng | null =
    community.home_lat != null && community.home_lng != null ? { lat: community.home_lat, lng: community.home_lng } : null;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(community.home_name ?? "");
  const [coords, setCoords] = useState<LatLng | null>(saved);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!saved && !isCoord) return null;

  async function save() {
    if (!coords) return setError("Marcá la sede en el mapa.");
    if (name.trim().length < 2) return setError("Poné un nombre (por ejemplo: Sede del Grupo Scout 123).");
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("communities")
      .update({ home_name: name.trim(), home_lat: coords.lat, home_lng: coords.lng })
      .eq("id", community.id);
    setSaving(false);
    if (err) return setError(errorMessage(err));
    await qc.invalidateQueries({ queryKey: ["community"] });
    setEditing(false);
    toast("Sede guardada. Ya aparece como opción al crear actividades.");
  }

  return (
    <>
      <SectionTitle>Sede</SectionTitle>
      <Card className="flex flex-col gap-3 p-4">
        {!editing ? (
          saved ? (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{community.home_name || "Sede del grupo"}</p>
                <p className="text-[13px] text-muted">Se puede elegir con un toque al crear una actividad.</p>
              </div>
              <a href={directionsUrl(community.home_name, saved) ?? "#"} target="_blank" rel="noopener" className="inline-flex min-h-10 flex-none items-center rounded-xl border border-line px-3 text-sm font-bold">
                Cómo llegar
              </a>
            </div>
          ) : (
            <p className="text-[14.5px] text-muted">
              Marcá dónde se juntan habitualmente. Así, al crear una actividad, se elige la sede con un solo toque.
            </p>
          )
        ) : (
          <>
            <Field id="home_name" label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sede del Grupo Scout 123" />
            <Suspense fallback={<div className="flex h-60 items-center justify-center gap-2 text-muted"><Spinner /> Cargando mapa…</div>}>
              <LocationPicker value={coords} query={name} onChange={setCoords} onPlaceName={(n) => setName(n)} />
            </Suspense>
            {error ? <ErrorBox message={error} /> : null}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => { setEditing(false); setCoords(saved); setName(community.home_name ?? ""); setError(null); }}>
                Cancelar
              </Button>
              <Button variant="primary" className="flex-1" loading={saving} onClick={() => void save()}>
                Guardar sede
              </Button>
            </div>
          </>
        )}
        {isCoord && !editing ? (
          <Button onClick={() => setEditing(true)}>{saved ? "Cambiar sede" : "Marcar la sede"}</Button>
        ) : null}
      </Card>
    </>
  );
}
