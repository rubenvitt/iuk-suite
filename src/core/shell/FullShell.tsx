import { auth } from "@/core/auth";
import { visibleSwitcherModules, getModule } from "@/core/registry";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { AppSwitcher } from "@/core/shell/AppSwitcher";

export async function FullShell({
  moduleKey,
  children,
}: {
  moduleKey: string;
  children: React.ReactNode;
}) {
  const session = await auth();
  const mod = getModule(moduleKey);
  // href wird hier (server-seitig) über moduleUrl() gebaut: moduleUrl() liest
  // process.env.PORT/SUITE_DEV_HOST_SUFFIX, die im Client-Bundle nicht
  // verfügbar sind. AppSwitcher bekommt nur die fertige href und ruft
  // moduleUrl() selbst nie auf.
  const entries = visibleSwitcherModules(session?.user?.groups ?? null).map(
    (m) => ({ key: m.key, title: m.title, icon: m.icon, href: moduleUrl(m.key) })
  );
  return (
    <div className="min-h-screen">
      <header
        className="flex items-center justify-between border-b px-4 py-3"
        data-testid="full-shell-header"
      >
        <div className="font-bold" data-testid="module-title">
          {mod.title}
        </div>
        <AppSwitcher entries={entries} userName={session?.user?.name ?? null} />
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
