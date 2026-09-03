import { Alert, Card, Col, Row, Statistic } from "antd";
import Link from "next/link";
import { canAdminModule } from "@/core/auth/guards";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { KATALOG_STAND } from "../_lib/katalog";
import { VORBEHALT } from "../_lib/vorbehalt";

/**
 * DIE STARTSEITE — Vorbehalt, Katalogstand, Einstiege (Spec §2).
 *
 * ⛔ EINE SERVER COMPONENT, UND SIE BLEIBT EINE. Was hier sicher ist und was HTTP 500 ergibt,
 * ist gemessen und steht in `CLAUDE.md`:
 *   SICHER   `Card`, `Statistic`, `Result`, `Progress`, `Tag`, `Row`, `Col`, `Alert` — alles
 *            Direktexporte von `antd`. Sie sind selbst Client-Komponenten; sie AUS einer Server
 *            Component zu rendern ist erlaubt, es entsteht eine gewoehnliche Client-Referenz.
 *   HTTP 500 JEDER Compound-Zugriff: `Typography.Title`, `Descriptions.Item`, `Form.Item`,
 *            `Input.TextArea`, `List.Item` (Falle 1). Statt `Typography.Title` steht hier
 *            `core/shell/Seitenkopf` mit nativem `<h1>`.
 *   HTTP 500 jeder Import aus `@ant-design/icons` (Falle 7) — und `"use client"` behebt das
 *            nicht, es macht es still. Dieses Modul fasst das Paket nirgends an;
 *            `core/shell/icons.test.ts` riegelt das repo-weit ab.
 *   VERBOTEN antds `Table` und `Listy` (Falle 9): beide verlangen eine Funktion als Prop, und
 *            eine in einer Server Component entstandene Funktion darf die RSC-Grenze nicht
 *            ueberqueren.
 *
 * `showIcon` AN `Alert` IST KEIN VERSTOSS GEGEN FALLE 7: das Zeichen kommt aus antds eigenem
 * Bundle, im Client-Graph. Vorbild `radio/admin/(arbeit)/versionen/page.tsx:109-114`, eine
 * Server Component mit demselben Aufruf.
 *
 * `force-dynamic`, WEIL DIE SEITE DIE SITZUNG LIEST: der Verwaltungseinstieg haengt an
 * `canAdminModule`. Eine vorgerenderte Fassung zeigte allen dieselbe Karte. Vorbild
 * `aufgaben/page.tsx`.
 *
 * ⚠️ DIE VIER EINSTIEGE ZEIGEN AUF ROUTEN, DIE ES NACH DIESEM COMMIT NOCH NICHT GIBT — Katalog
 * und Merkliste kommen in Aufgabe 6, Baukasten und Meine Zeichen in Aufgabe 7, Ueben und
 * Lernsets in Aufgabe 8. Das steht im Commit-Text; eine Release-Notiz gibt es deshalb hier
 * ausdruecklich noch nicht.
 */
export const dynamic = "force-dynamic";

type Einstieg = { key: string; titel: string; href: string; text: string };

const EINSTIEGE: Einstieg[] = [
  {
    key: "katalog",
    titel: "Katalog",
    href: "/m/zeichen/katalog",
    text: "Alle Zeichen durchsuchen und nach Kapitel, Organisation und Grundform filtern.",
  },
  {
    key: "merkliste",
    titel: "Merkliste",
    href: "/m/zeichen/merkliste",
    text: "Die Zeichen, die du dir gemerkt hast — an einer Stelle.",
  },
  {
    key: "baukasten",
    titel: "Baukasten",
    href: "/m/zeichen/baukasten",
    text: "Ein Zeichen Schritt für Schritt zusammenstellen und als Bild herunterladen.",
  },
  {
    key: "lernen",
    titel: "Üben",
    href: "/m/zeichen/lernen",
    text: "Fragen zu Zeichen und Bedeutungen, in Stufen wiederholt.",
  },
];

const VERWALTUNG: Einstieg = {
  key: "lernsets",
  titel: "Lernsets",
  href: "/m/zeichen/verwaltung/lernsets",
  text: "Kuratierte Listen für das Üben anlegen und pflegen.",
};

export default async function ZeichenStartPage() {
  const darfVerwalten = await canAdminModule("zeichen");
  const einstiege = darfVerwalten ? [...EINSTIEGE, VERWALTUNG] : EINSTIEGE;

  return (
    <>
      <Seitenkopf
        titel="Taktische Zeichen"
        beschreibung="Nachschlagen, selbst zusammenstellen und üben."
      />

      {/*
        ⛔ `type="warning"`, NIE `type="error"` (Falle 3). Der Griff sitzt im Titel und nicht am
        Kasten, weil `Alert` fremde Attribute nicht zuverlaessig an seine Wurzel durchreicht —
        Vorbild `radio/.../versionen/page.tsx:112`.
      */}
      <Alert
        type="warning"
        showIcon
        title={<span data-testid="zeichen-vorbehalt">{VORBEHALT.titel}</span>}
        description={VORBEHALT.text}
        style={{ marginBlockEnd: SPACE.xl }}
      />

      <Card style={{ marginBlockEnd: SPACE.xl }}>
        <Statistic title="Zeichen in der Sammlung" value={KATALOG_STAND.anzahl} />
        <p
          data-rolle="zeichen-katalogstand"
          style={{ ...SCHRIFT.neben, margin: 0, marginBlockStart: SPACE.sm }}
        >
          Stand {KATALOG_STAND.erzeugtAm} · Zeichensatz {KATALOG_STAND.paket} · Daten{" "}
          {KATALOG_STAND.daten}
        </p>
      </Card>

      {/*
        `Link` UM DIE `Card` UND KEIN `onClick` AUF IHR: ein Handler waere eine Funktion ueber
        die RSC-Grenze (Falle 9) und kostete eine Insel, die diese Flaeche sonst nicht braucht.
        Vorbild `radio/admin/(arbeit)/page.tsx`.
        `color: "inherit"` AM LINK: ohne ihn faerbte `colorLink` den ganzen Kartentext in
        Suite-Rot — und Rot traegt in diesem Modul fachliche Bedeutung (Falle 3).
      */}
      <Row gutter={[SPACE.lg, SPACE.lg]}>
        {einstiege.map((e) => (
          <Col key={e.key} xs={24} sm={12} xl={8}>
            <Link href={e.href} style={{ display: "block", height: "100%", color: "inherit" }}>
              <Card hoverable title={e.titel} style={{ height: "100%" }}>
                <span style={SCHRIFT.text}>{e.text}</span>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </>
  );
}
