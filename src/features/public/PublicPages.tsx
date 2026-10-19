import type { ReactNode } from "react";

const REPO = "https://github.com/cchavax/app-rover";

/** Páginas públicas (sin login): las pide Google para publicar el acceso con Google. */
export function publicPageFor(path: string): ReactNode | null {
  if (path === "/acerca" || path === "/acerca/") return <AboutPage />;
  if (path === "/privacidad" || path === "/privacidad/") return <PrivacyPage />;
  return null;
}

function Layout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-10 text-[15.5px] leading-relaxed">
      <a href="/acerca" className="flex items-center gap-3">
        <img src="/pwa-192.png" alt="" width={40} height={40} className="rounded-xl" />
        <span className="font-display text-2xl font-extrabold">Fogón</span>
      </a>
      <h1 className="font-display text-3xl font-extrabold leading-tight">{title}</h1>
      {children}
      <footer className="mt-6 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4 text-sm text-muted">
        <a href="/acerca">Qué es Fogón</a>
        <a href="/privacidad">Política de privacidad</a>
        <a href={REPO} target="_blank" rel="noopener">Código abierto</a>
      </footer>
    </main>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="mt-2 font-display text-xl font-extrabold">{children}</h2>;
}

export function AboutPage() {
  return (
    <Layout title="La agenda de tu Comunidad Rover">
      <p>
        Fogón es una app gratuita para que las Comunidades Rover de Scouts de Argentina organicen su vida de comunidad desde el
        celular.
      </p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5">
        <li>Calendario de actividades, incluidas las que se repiten (la reunión de todos los sábados, el consejo del primer sábado).</li>
        <li>Proyectos de la comunidad con sus responsables y actividades.</li>
        <li>Confirmación de asistencia (voy / tal vez / no voy) y toma de lista.</li>
        <li>Notificaciones: actividades nuevas, cambios y recordatorios.</li>
      </ul>
      <p>
        Cada comunidad es privada: solo la ven sus miembros aprobados. Los educadores acompañan como observadores. Se entra con la
        cuenta de Google.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href="/" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-bold text-white">Entrar a Fogón</a>
        <a href="/privacidad" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 font-bold">Política de privacidad</a>
      </div>
    </Layout>
  );
}

export function PrivacyPage() {
  return (
    <Layout title="Política de privacidad">
      <p className="text-sm text-muted">Última actualización: 19 de octubre de 2026.</p>
      <p>
        Esta política explica qué datos usa Fogón, para qué y cómo podés borrarlos. Fogón es un proyecto voluntario y de código
        abierto, pensado para Comunidades Rover de Scouts de Argentina.
      </p>

      <H>Qué datos usamos</H>
      <ul className="flex list-disc flex-col gap-1.5 pl-5">
        <li>
          <strong>De tu cuenta de Google:</strong> nombre, dirección de correo y foto de perfil. Solo esos tres datos; no accedemos a
          tu Gmail, Drive, contactos ni ningún otro servicio de Google.
        </li>
        <li><strong>Lo que cargás vos:</strong> apodo y teléfono (opcionales).</li>
        <li>
          <strong>Lo que hacés en tu comunidad:</strong> actividades y proyectos que creás, tus respuestas de asistencia y la asistencia
          registrada.
        </li>
        <li>
          <strong>Notificaciones:</strong> si las activás, una dirección técnica del dispositivo para poder enviarte avisos. Se borra
          al desactivarlas.
        </li>
      </ul>

      <H>Para qué los usamos</H>
      <p>
        Únicamente para que la app funcione: identificarte al entrar, mostrarte a los miembros de tu comunidad y enviarte los avisos
        que elegiste. No vendemos ni compartimos tus datos con terceros, no mostramos publicidad y no usamos los datos de Google para
        ningún otro fin.
      </p>

      <H>Quién los ve</H>
      <p>
        Solo los miembros aprobados de tu comunidad ven tu nombre, foto y asistencia. Tu teléfono lo ven únicamente los miembros
        activos de tu comunidad. Nadie de otra comunidad ve tus datos. Tu correo no se muestra a otros miembros.
      </p>

      <H>Dónde se guardan</H>
      <p>
        En los servicios de Supabase (base de datos y autenticación) y Vercel (la página web), que actúan como proveedores de
        infraestructura. Las conexiones van cifradas y los permisos se controlan en la base de datos.
      </p>

      <H>Tus derechos y cómo borrar tus datos</H>
      <p>
        Podés modificar tus datos desde <strong>Perfil</strong>, y borrar tu cuenta desde <strong>Perfil → Borrar mi cuenta</strong>:
        se elimina tu teléfono y tu nombre pasa a mostrarse como “Ex miembro”. Las actividades que creaste quedan para tu comunidad,
        sin tus datos personales. Estos derechos de acceso, rectificación y supresión son los que establece la Ley 25.326 de
        Protección de los Datos Personales de Argentina. La Agencia de Acceso a la Información Pública es el órgano de control de esa
        ley.
      </p>

      <H>Contacto</H>
      <p>
        Para consultas sobre tus datos, hablá con quien coordina tu comunidad o abrí un pedido en{" "}
        <a href={`${REPO}/issues`} target="_blank" rel="noopener" className="font-bold text-accent">
          github.com/cchavax/app-rover
        </a>
        .
      </p>
    </Layout>
  );
}
