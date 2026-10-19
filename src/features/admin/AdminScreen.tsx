import { Button, Card, ErrorBox, Loading, SectionTitle, useToast } from "../../components/ui.tsx";
import { keys, usePendingCommunities, useRpc } from "../../lib/queries.ts";
import { errorMessage } from "../../lib/supabase.ts";
import { displayName } from "../../lib/types.ts";

/** Panel del superadmin de la plataforma (paso 1: aprobar comunidades). */
export function AdminScreen() {
  const toast = useToast();
  const pending = usePendingCommunities(true);
  const review = useRpc<{ p_community_id: string; p_approve: boolean }>("review_community", [keys.pendingCommunities]);

  if (pending.isLoading) return <Loading />;
  if (pending.error) return <ErrorBox message={errorMessage(pending.error)} onRetry={() => void pending.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>Comunidades por aprobar ({pending.data?.length ?? 0})</SectionTitle>
      {pending.data?.length ? null : <p className="py-6 text-center text-muted">No hay solicitudes pendientes.</p>}
      {pending.data?.map((c) => (
        <Card key={c.id} className="flex flex-col gap-3 p-4">
          <div>
            <h3 className="font-display text-lg font-extrabold">{c.name}</h3>
            <p className="text-sm text-muted">
              {c.scout_group} · {c.city} · pedida por {displayName(c.creator)} el {new Date(c.created_at).toLocaleDateString("es-AR")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={review.isPending} onClick={() => review.mutate({ p_community_id: c.id, p_approve: false }, { onSuccess: () => toast("Comunidad rechazada.") })}>
              Rechazar
            </Button>
            <Button variant="primary" className="flex-1" disabled={review.isPending} onClick={() => review.mutate({ p_community_id: c.id, p_approve: true }, { onSuccess: () => toast(`${c.name} aprobada.`) })}>
              Aprobar
            </Button>
          </div>
        </Card>
      ))}
      {review.error ? <ErrorBox message={errorMessage(review.error)} /> : null}
    </div>
  );
}
