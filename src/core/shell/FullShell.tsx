import { Layout } from "antd";
// Siehe Kommentar in SuiteHeader.tsx: `Content` als direkter Named-Import aus dem
// tiefen Pfad, nicht als `Layout.Content` — sonst 500 in der Server Component.
import { Content } from "antd/es/layout/layout";

import { SuiteHeader } from "@/core/shell/SuiteHeader";
import type { SuiteNavItem } from "@/core/shell/types";
import { SPACE } from "@/core/theme/tokens";

export async function FullShell({
  moduleKey,
  nav,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <SuiteHeader moduleKey={moduleKey} nav={nav} />
      <Content style={{ padding: SPACE.lg }}>{children}</Content>
    </Layout>
  );
}
