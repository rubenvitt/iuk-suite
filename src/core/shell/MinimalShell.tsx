import { Layout } from "antd";
// `Header`/`Content` NICHT als `Layout.Header`/`Layout.Content` referenzieren:
// antds Layout-Komposition hängt die Unterkomponenten erst zur Laufzeit per
// Property-Zuweisung an (`Layout.Header = Header`, siehe antd/es/layout/index.js).
// In einer Server-Komponente löst Next/Turbopack diesen Laufzeit-Property-Zugriff
// auf einem "use client"-Export nicht auf — das Ergebnis ist `undefined` und ein
// 500er ("Element type is invalid: … got: undefined"). Der direkte Named-Import
// umgeht das: dieselbe Komponente, aber als statisch importierte Bindung, die der
// RSC-Bundler korrekt auflöst. Empirisch verifiziert (curl gegen `next dev`);
// `pnpm build`/`pnpm typecheck` decken das NICHT ab, weil sie die dynamischen
// Modul-Routen nicht mit echten Requests rendern.
import { Header, Content } from "antd/es/layout/layout";
import { getModule } from "@/core/registry";

import { SPACE } from "@/core/theme/tokens";
export function MinimalShell({
  moduleKey,
  children,
}: {
  moduleKey: string;
  children: React.ReactNode;
}) {
  const mod = getModule(moduleKey);
  return (
    <Layout style={{ minHeight: "100vh" }} data-testid="minimal-shell">
      <Header style={{ paddingInline: SPACE.lg }}>
        <strong>{mod.title}</strong>
      </Header>
      <Content style={{ padding: SPACE.lg }}>
        <div style={{ maxWidth: 640, marginInline: "auto" }}>{children}</div>
      </Content>
    </Layout>
  );
}
