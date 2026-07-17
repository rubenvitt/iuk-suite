import { getModule } from "@/core/registry";

export function MinimalShell({
  moduleKey,
  children,
}: {
  moduleKey: string;
  children: React.ReactNode;
}) {
  const mod = getModule(moduleKey);
  return (
    <div className="min-h-screen" data-testid="minimal-shell">
      <header className="border-b px-4 py-3 font-bold">{mod.title}</header>
      <main className="p-4">{children}</main>
    </div>
  );
}
