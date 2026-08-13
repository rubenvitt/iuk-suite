import { Layout } from "antd";
// Siehe SuiteHeader.tsx: direkte Named-Imports aus dem tiefen Pfad, nicht
// `Layout.Content` / `Layout.Sider` — Property-Zugriffe auf antd-Compounds
// ergeben in einer Server Component `undefined` und HTTP 500. `Sider` liegt in
// einer eigenen Datei neben `layout.js` (antd 6.5.3, nachgesehen).
import { Content } from "antd/es/layout/layout";
import Sider from "antd/es/layout/Sider";

import { SuiteHeader } from "@/core/shell/SuiteHeader";
import { Modulleiste } from "@/core/shell/Modulleiste";
import { hatAbschnitte } from "@/core/shell/navAbschnitte";
import type { SuiteNavItem } from "@/core/shell/types";
import { SPACE } from "@/core/theme/tokens";
import s from "./shell.module.css";

export async function FullShell({
  moduleKey,
  nav,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  const mitLeiste = hatAbschnitte(nav ?? []);
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <SuiteHeader moduleKey={moduleKey} nav={nav} />
      {mitLeiste ? (
        <Layout>
          {/*
           * `breakpoint`/`collapsedWidth` bewusst NICHT gesetzt: antds
           * Sider-Breakpoints laufen über JS und zeigen beim ersten Render die
           * falsche Variante. Die Umschaltung macht `shell.module.css` mit dem
           * einen Suite-Breakpoint — unter 768px steht die Leiste gar nicht da,
           * die Navigation liegt dort im Drawer.
           */}
          <Sider width={240} theme="light" className={s.sider}>
            <Modulleiste nav={nav ?? []} />
          </Sider>
          <Content style={{ padding: SPACE.lg }}>{children}</Content>
        </Layout>
      ) : (
        <Content style={{ padding: SPACE.lg }}>{children}</Content>
      )}
    </Layout>
  );
}
