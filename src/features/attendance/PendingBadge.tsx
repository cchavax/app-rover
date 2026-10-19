import { useUpcomingWithMyRsvps } from "./usePending.ts";

/** Numerito rojo en la pestaña Próximas con lo que me falta responder. */
export function PendingBadge() {
  const { pending } = useUpcomingWithMyRsvps();
  if (!pending.length) return null;
  return (
    <span className="absolute left-[calc(50%+6px)] top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent px-1 text-[10.5px] font-bold text-white" aria-label={`${pending.length} sin responder`}>
      {pending.length > 9 ? "9+" : pending.length}
    </span>
  );
}
