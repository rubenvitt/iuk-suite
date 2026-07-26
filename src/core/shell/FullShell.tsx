import { Layout } from "antd";
// Siehe Kommentar in MinimalShell.tsx: `Header`/`Content` als direkte Named-Imports,
// nicht als `Layout.Header`/`Layout.Content` — sonst 500 ("Element type is invalid"),
// weil Next/Turbopack die Laufzeit-Property-Zuweisung von antds Layout-Komposition
// aus einer Server-Komponente heraus nicht auflöst.
import { Header, Content } from "antd/es/layout/layout";
import Link from "next/link";
import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { switcherEntries } from "@/core/shell/switcherEntries";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { AppSwitcher } from "@/core/shell/AppSwitcher";
import { ThemeToggle } from "@/core/theme/ThemeToggle";

import { SPACE } from "@/core/theme/tokens";
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
          gap: SPACE.lg,
          paddingInline: SPACE.lg,
        }}
      >
        {/*
         * Der Modultitel fuehrt auf die Startseite SEINES Moduls (Entwurf
         * feedback-admin §4.1, §5.1 Punkt 1). Ohne diesen Link ist jede
         * Unterseite eine Sackgasse — der Defekt hing an der Shell und galt
         * damit fuer jedes Modul mit `shell: "full"`.
         *
         * `data-testid` bleibt auf dem `<strong>` und wandert NICHT an den Link:
         * der Keystone-E2E fragt es dort ab. `moduleUrl` kennt Dev- und
         * Prod-Hosts; ohne Host bleibt "/" (dieselbe Herkunft) — nie ein toter
         * Link.
         */}
        <Link
          href={moduleUrl(moduleKey) ?? "/"}
          style={{ color: "inherit", textDecoration: "none", flex: "0 1 auto", minWidth: 0 }}
        >
          <strong data-testid="module-title">{mod.title}</strong>
        </Link>
        {/*
         * `flexWrap: nowrap` + `overflow: hidden` (§5.1 Punkt 1): ohne beides
         * bricht die Leiste auf schmalen Fenstern UEBER den Titel, und die
         * Kopfzeile faengt an, zwei Zeilen hoch zu sein.
         */}
        <span
          data-testid="full-shell-switcher"
          style={{
            display: "flex",
            alignItems: "center",
            gap: SPACE.sm,
            flexWrap: "nowrap",
            overflow: "hidden",
          }}
        >
          <AppSwitcher entries={entries} userName={session?.user?.name ?? null} />
          <ThemeToggle />
        </span>
      </Header>
      <Content style={{ padding: SPACE.lg }}>{children}</Content>
    </Layout>
  );
}
