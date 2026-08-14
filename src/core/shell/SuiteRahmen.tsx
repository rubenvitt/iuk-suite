import { Layout } from "antd";
// Siehe SuiteHeader.tsx: direkte Named-Imports aus dem tiefen Pfad, nicht
// `Layout.Content` / `Layout.Sider` — Property-Zugriffe auf antd-Compounds
// ergeben in einer Server Component `undefined` und HTTP 500 (Falle 1).
// `Sider` liegt in einer eigenen Datei neben `layout.js`.
import { Content } from "antd/es/layout/layout";
import Sider from "antd/es/layout/Sider";

import { SuiteHeader } from "@/core/shell/SuiteHeader";
import { Modulleiste } from "@/core/shell/Modulleiste";
import type { SuiteNavItem } from "@/core/shell/types";
import { SPACE } from "@/core/theme/tokens";
import s from "./shell.module.css";

/**
 * DAS GERUEST, DAS `FullShell` UND `MinimalShell` TEILEN — Kopfzeile,
 * optionale Seitenleiste, Inhalt.
 *
 * Bis 2026-08-13 hatte jede der beiden Varianten ihr eigenes Geruest, und die
 * Seitenleiste gab es nur in `FullShell` und nur, wenn die Navigation
 * Abschnitte trug (`hatAbschnitte`, geloescht). Module auf `MinimalShell` —
 * `qr` und `beta` — bekamen ihre Navigation als zweite Kopfzeile. Zwei
 * Bauformen fuer dieselbe Sache; wer die zweite Zeile ersatzlos loeschte,
 * haette `qr` seine Navigation genommen.
 *
 * WAS DIE BEIDEN VARIANTEN NOCH UNTERSCHEIDET, steht deshalb nicht mehr hier,
 * sondern in ihren `children`: `FullShell` legt die Arbeitsdichte darum,
 * `MinimalShell` eine 640px-Spalte. Beides sind Eigenschaften des INHALTS,
 * nicht des Rahmens.
 *
 * DIE LEISTE HAENGT AN `nav.length > 0`, nicht an einem Praedikat ueber den
 * Daten. Ein Modul ohne Navigation (`alpha`, `gamma`, `beta`, `kioskdemo`)
 * bekommt gar keine Leiste und keinen leeren Streifen daneben.
 *
 * Unterhalb von 768px steht die Leiste auf `display: none` (`shell.module.css`)
 * und die Navigation liegt im Drawer. Die Umschaltung ist CSS und nie antds
 * `breakpoint`-Prop am Sider: das laeuft ueber JS und zeigt beim ersten Render
 * die falsche Variante.
 */
export async function SuiteRahmen({
  moduleKey,
  nav = [],
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <SuiteHeader moduleKey={moduleKey} nav={nav} />
      <Layout>
        {nav.length > 0 ? (
          <Sider width={240} theme="light" className={s.sider}>
            <Modulleiste nav={nav} />
          </Sider>
        ) : null}
        <Content style={{ padding: SPACE.lg }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
