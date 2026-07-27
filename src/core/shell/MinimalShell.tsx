import { Layout } from "antd";
// Deep-Import, KEIN `Layout.Content` und keine Destrukturierung: antd haengt die
// Unterkomponenten per Property-Zuweisung an (`antd/es/layout/index.js`), und in
// einer Server Component ist der Zugriff darauf `undefined` -> HTTP 500. Der
// Build sieht das nicht.
import { Content } from "antd/es/layout/layout";

import { SuiteHeader } from "@/core/shell/SuiteHeader";
import type { SuiteNavItem } from "@/core/shell/types";
import { SPACE } from "@/core/theme/tokens";

/**
 * Wie `FullShell`, nur mit begrenzter Inhaltsbreite. Die Kopfzeile ist seit
 * dem Suite-Chrome-Umbau dieselbe: vorher zeigte `minimal` nur den Modultitel,
 * und wer in `qr` sasz, kam ohne Adressleiste in kein anderes Modul.
 */
export async function MinimalShell({
  moduleKey,
  nav,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  return (
    <Layout style={{ minHeight: "100vh" }} data-testid="minimal-shell">
      <SuiteHeader moduleKey={moduleKey} nav={nav} />
      <Content style={{ padding: SPACE.lg }}>
        <div style={{ maxWidth: 640, marginInline: "auto" }}>{children}</div>
      </Content>
    </Layout>
  );
}
