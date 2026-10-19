import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router";
import { AppProvider } from "./app/context.tsx";
import { ErrorBox, Loading } from "./components/ui.tsx";
import { ActivityDetailScreen } from "./features/activities/ActivityDetailScreen.tsx";
import { ActivityFormScreen } from "./features/activities/ActivityFormScreen.tsx";
import { TakeListScreen } from "./features/attendance/TakeListScreen.tsx";
import { PendingBadge } from "./features/attendance/PendingBadge.tsx";
import { CalendarScreen } from "./features/activities/CalendarScreen.tsx";
import { UpcomingScreen } from "./features/activities/UpcomingScreen.tsx";
import { ProjectDetailScreen } from "./features/projects/ProjectDetailScreen.tsx";
import { ProjectFormScreen } from "./features/projects/ProjectFormScreen.tsx";
import { ProjectsScreen } from "./features/projects/ProjectsScreen.tsx";
import { TrashScreen } from "./features/projects/TrashScreen.tsx";
import { AdminScreen } from "./features/admin/AdminScreen.tsx";
import { useAuth } from "./features/auth/AuthProvider.tsx";
import { LoginScreen } from "./features/auth/LoginScreen.tsx";
import { PrivacyScreen } from "./features/auth/PrivacyScreen.tsx";
import { CommunityScreen } from "./features/community/CommunityScreen.tsx";
import { OnboardingScreen } from "./features/onboarding/OnboardingScreen.tsx";
import { ProfileScreen } from "./features/profile/ProfileScreen.tsx";
import { useEffect } from "react";
import { refreshPushSubscription } from "./lib/push.ts";
import { useCommunity, useMyMemberships, useProfile } from "./lib/queries.ts";
import { errorMessage, supabaseConfigured } from "./lib/supabase.ts";
import { displayName, type Community, type MemberRole, type Profile } from "./lib/types.ts";

export default function App() {
  if (!supabaseConfigured) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <ErrorBox message="Falta configurar Supabase: cargá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en las variables de entorno y volvé a desplegar." />
      </main>
    );
  }
  return <Gate />;
}

/** Decide qué ve el usuario según en qué punto del ingreso está. */
function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <LoginScreen />;
  return <SignedIn uid={session.user.id} />;
}

function SignedIn({ uid }: { uid: string }) {
  // Si este dispositivo ya tenía notificaciones, re-guardamos la suscripción (el navegador puede renovarla).
  useEffect(() => {
    void refreshPushSubscription().catch(() => {});
  }, [uid]);
  const profile = useProfile(uid);
  const memberships = useMyMemberships(uid);

  const active = memberships.data?.find((m) => m.status === "activo");
  const community = useCommunity(active?.community_id);

  if (profile.isLoading || memberships.isLoading || (active && community.isLoading)) return <Loading />;
  const err = profile.error ?? memberships.error ?? community.error;
  if (err || !profile.data || !memberships.data)
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <ErrorBox message={errorMessage(err)} onRetry={() => window.location.reload()} />
      </main>
    );

  if (!profile.data.privacy_accepted_at) return <PrivacyScreen uid={uid} />;

  if (!active || !community.data) {
    // El superadmin puede no pertenecer a ninguna comunidad y aun así necesita su panel.
    if (profile.data.is_superadmin) return <Shell profile={profile.data} community={null} role={null} />;
    return <OnboardingScreen uid={uid} memberships={memberships.data} name={firstName(profile.data)} />;
  }

  if (community.data.status !== "activa") {
    // El superadmin igual necesita llegar a su panel para aprobar (incluida su propia comunidad).
    if (profile.data.is_superadmin) return <Shell profile={profile.data} community={null} role={null} />;
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10">
        <h1 className="font-display text-3xl font-extrabold">{community.data.name}</h1>
        <p className="text-muted">
          {community.data.status === "pendiente"
            ? "Tu comunidad está esperando aprobación. Cuando esté lista vas a poder invitar al resto. No hace falta que hagas nada más."
            : "La solicitud de esta comunidad fue rechazada. Si creés que es un error, escribinos."}
        </p>
      </main>
    );
  }

  return <Shell profile={profile.data} community={community.data} role={active.role} />;
}

const firstName = (p: Profile) => displayName(p).split(" ")[0] ?? "";

function Shell({ profile, community, role }: { profile: Profile; community: Community | null; role: MemberRole | null }) {
  const tabs =
    community && role
      ? [
          { to: "/", label: "Próximas", icon: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" },
          { to: "/calendario", label: "Calendario", icon: "M5 4.5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2zM3 9.5h18M8 2.5v4M16 2.5v4" },
          { to: "/proyectos", label: "Proyectos", icon: "M5 21V4M5 4h11l-2 4 2 4H5" },
          { to: "/comunidad", label: "Comunidad", icon: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2" },
          { to: "/perfil", label: "Perfil", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" }
        ]
      : [];
  const home = community && role ? "/" : "/admin";

  const content = (
    <BrowserRouter>
      <header className="sticky top-0 z-20 border-b border-line bg-surface" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto max-w-xl px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{community?.name ?? "Fogón"}</p>
          <h1 className="font-display text-2xl font-extrabold">Fogón</h1>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pb-28 pt-4">
        <Routes>
          {community && role ? (
            <>
              <Route path="/" element={<UpcomingScreen />} />
              <Route path="/calendario" element={<CalendarScreen />} />
              <Route path="/actividades/nueva" element={<ActivityFormScreen />} />
              <Route path="/actividades/:id" element={<ActivityDetailScreen />} />
              <Route path="/actividades/:id/editar" element={<ActivityFormScreen />} />
              <Route path="/actividades/:id/lista" element={<TakeListScreen />} />
              <Route path="/proyectos" element={<ProjectsScreen />} />
              <Route path="/proyectos/nuevo" element={<ProjectFormScreen />} />
              <Route path="/proyectos/:id" element={<ProjectDetailScreen />} />
              <Route path="/proyectos/:id/editar" element={<ProjectFormScreen />} />
              <Route path="/papelera" element={<TrashScreen />} />
              <Route path="/comunidad" element={<CommunityScreen community={community} myRole={role} uid={profile.id} />} />
              <Route path="/perfil" element={<ProfileScreen profile={profile} community={community} myRole={role} />} />
            </>
          ) : null}
          {profile.is_superadmin ? <Route path="/admin" element={<AdminScreen />} /> : null}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>

      {tabs.length > 0 ? (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Secciones">
          <div className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === "/"}
                className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11.5px] ${isActive ? "font-bold text-accent" : "text-muted"}`}
              >
                <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={t.icon} />
                </svg>
                {t.label}
                {t.to === "/" ? <PendingBadge /> : null}
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}
    </BrowserRouter>
  );
  return community && role ? <AppProvider value={{ community, role, profile }}>{content}</AppProvider> : content;
}
