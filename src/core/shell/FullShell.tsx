import { Layout } from "antd";
// Siehe Kommentar in MinimalShell.tsx: `Header`/`Content` als direkte Named-Imports,
// nicht als `Layout.Header`/`Layout.Content` — sonst 500 ("Element type is invalid"),
// weil Next/Turbopack die Laufzeit-Property-Zuweisung von antds Layout-Komposition
// aus einer Server-Komponente heraus nicht auflöst.
import { Header, Content } from "antd/es/layout/layout";
import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { switcherEntries } from "@/core/shell/switcherEntries";
import { AppSwitcher } from "@/core/shell/AppSwitcher";
import { ThemeToggle } from "@/core/theme/ThemeToggle";

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
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        data-testid="full-shell-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          paddingInline: 16,
        }}
      >
        <strong data-testid="module-title">{mod.title}</strong>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AppSwitcher entries={entries} userName={session?.user?.name ?? null} />
          <ThemeToggle />
        </span>
      </Header>
      <Content style={{ padding: 16 }}>{children}</Content>
    </Layout>
  );
}
