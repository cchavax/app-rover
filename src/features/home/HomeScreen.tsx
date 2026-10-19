import { Card } from "../../components/ui.tsx";
import type { Community } from "../../lib/types.ts";

/** Paso 1: todavía no hay calendario. En el paso 2 acá va "Próximas actividades". */
export function HomeScreen({ community, firstName }: { community: Community; firstName: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2 p-5">
        <p className="text-sm font-bold uppercase tracking-widest text-accent">¡Bienvenido, {firstName}!</p>
        <h2 className="font-display text-2xl font-extrabold">Ya estás en {community.name}</h2>
        <p className="text-[15px] text-muted">
          Esta es la primera versión: por ahora podés armar la comunidad, invitar gente y completar tu perfil. Lo próximo es el
          calendario de actividades y proyectos.
        </p>
      </Card>
    </div>
  );
}
