import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { switcherEntries } from "@/core/shell/switcherEntries";
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
  // Einträge werden hier (server-seitig) gebaut: switcherEntries() liest über
  // moduleUrl() process.env, das im Client-Bundle nicht verfügbar ist.
  // AppSwitcher bekommt nur fertige hrefs.
  const entries = switcherEntries(session?.user?.groups ?? null);
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
