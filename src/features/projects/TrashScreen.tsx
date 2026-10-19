import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "../../app/context.tsx";
import { Button, Card, ErrorBox, Loading, useToast } from "../../components/ui.tsx";
import { TYPES, useTrash } from "../../lib/activities.ts";
import { dayKey, shortDay } from "../../lib/dates.ts";
import { errorMessage, must, supabase } from "../../lib/supabase.ts";
import { BackLink } from "../activities/ActivityCard.tsx";

export function TrashScreen() {
  const { community, isCoord, tz } = useApp();
  const trash = useTrash(community.id);
  const toast = useToast();
  const qc = useQueryClient();

  async function restore(kind: "activity" | "project", id: string) {
    try {
      must(await supabase.rpc(kind === "activity" ? "restore_activity" : "restore_project", { p_id: id }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["trash"] }),
        qc.invalidateQueries({ queryKey: ["activities"] }),
        qc.invalidateQueries({ queryKey: ["projects"] })
      ]);
      toast("Restaurado.");
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  if (trash.isLoading) return <Loading />;
  if (trash.error) return <ErrorBox message={errorMessage(trash.error)} onRetry={() => void trash.refetch()} />;

  const daysLeft = (iso: string | null) => Math.max(0, 30 - Math.floor((Date.now() - Date.parse(iso ?? "")) / 864e5));
  const items = [
    ...(trash.data?.activities ?? []).map((a) => ({ kind: "activity" as const, id: a.id, title: a.title, sub: `${TYPES[a.type].label} · ${shortDay(dayKey(a.starts_at, tz))}`, when: a.deleted_at })),
    ...(trash.data?.projects ?? []).map((p) => ({ kind: "project" as const, id: p.id, title: p.name, sub: "Proyecto", when: p.deleted_at }))
  ].sort((x, y) => Date.parse(y.when ?? "") - Date.parse(x.when ?? ""));

  return (
    <div className="flex flex-col gap-3">
      <BackLink />
      <h2 className="font-display text-2xl font-extrabold">Papelera</h2>
      <p className="text-[14.5px] text-muted">
        Lo eliminado queda acá 30 días. {isCoord ? "Como coordinador ves lo de toda la comunidad." : "Ves lo que eliminaste vos."}
      </p>
      {items.length === 0 ? (
        <p className="py-8 text-center text-muted">La papelera está vacía.</p>
      ) : (
        <Card>
          {items.map((x, i) => (
            <div key={x.kind + x.id} className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-line" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{x.title}</div>
                <div className="text-[13px] text-muted">{x.sub} · quedan {daysLeft(x.when)} días</div>
              </div>
              <Button className="min-h-9 px-3 py-1 text-sm" onClick={() => void restore(x.kind, x.id)}>
                Restaurar
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
