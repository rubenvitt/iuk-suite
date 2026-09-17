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
  druck = false,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  /**
   * DIESE FLAECHE WIRD GEDRUCKT — DRK-406.
   *
   * Am BILDSCHIRM aendert das nichts: Kopfzeile und Seitenleiste stehen wie
   * ueberall. Im DRUCK faellt beides weg, dazu die `minHeight` an diesem
   * `Layout` und die Polsterung am `Content`. Die Regeln stehen in
   * `shell.module.css` unter „DIE DRUCKVORSCHAU IN DER SHELL"; dort steht auch,
   * warum sie `!important` brauchen.
   *
   * ⚠️ NUR EINE KLASSE, KEIN ZWEITER BAUM. Die Alternative waere gewesen, dem
   * Druckast eine eigene Rahmenkomponente zu geben — und damit eine zweite
   * Fassung der Kopfzeile, die die naechste Aenderung nicht mitbekommt. Genau
   * diesen Fehler beschreibt der Kopf dieser Datei fuer die beiden
   * Shell-Varianten, die bis 2026-08-13 je ein eigenes Geruest hatten.
   *
   * ⚠️ DER VORGABEWERT IST `false`, und er bleibt es. Jede andere Flaeche der
   * Suite wuerde sonst im Druck ihre Kopfzeile verlieren — unauffaellig, weil
   * niemand sie druckt, bis es doch jemand tut.
   */
  druck?: boolean;
  children: React.ReactNode;
}) {
  return (
    /*
     * ⚠️ `100dvh`, NICHT `100vh` — auf dem Telefon ist das der Unterschied
     * zwischen „fuellt den Schirm" und „ist immer einen Tick zu hoch".
     * `100vh` ist die GROSSE Sichtflaeche, also die Hoehe OHNE die
     * eingeblendete Adresszeile des Browsers. Solange die Adresszeile steht,
     * ist die Seite damit um deren Hoehe hoeher als das, was man sieht, und das
     * Dokument bekommt einen Scrollweg, den sein Inhalt gar nicht braucht.
     * Auf einer Seite mit eigenem Scroller daneben (`TabellenVollhoehe`) sind
     * das genau die zwei Scrollbalken, von denen mal der eine, mal der andere
     * reagiert. `100dvh` ist die Hoehe, die gerade tatsaechlich sichtbar ist.
     */
    <Layout className={druck ? s.druckRahmen : undefined} style={{ minHeight: "100dvh" }}>
      <SuiteHeader moduleKey={moduleKey} nav={nav} />
      <Layout>
        {nav.length > 0 ? (
          <Sider width={240} theme="light" className={s.sider}>
            <Modulleiste nav={nav} />
          </Sider>
        ) : null}
        {/*
          ⚠️ `s.druckInhalt` HAENGT IMMER DARAN, nicht nur wenn `druck` gilt.
          Die Klasse setzt fuer sich genommen NICHTS — sie existiert allein als
          Angriffspunkt der Druckregel, und die greift nur unterhalb von
          `.druckRahmen`. Bedingt gesetzt waere sie eine zweite Stelle, an der
          dieselbe Entscheidung faellt.
        */}
        <Content className={s.druckInhalt} style={{ padding: SPACE.lg }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
