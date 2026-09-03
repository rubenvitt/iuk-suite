import { Alert, Card } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SPACE } from "@/core/theme/tokens";
import { getDb } from "../../_db/client";
import { aktiveLernsets, idsAusSet } from "../../_db/lernen";
import { BaukastenLader } from "../../_ui/baukasten/BaukastenLader";
import { VORBEHALT } from "../../_lib/vorbehalt";

/*
 * DIE RSC-HUELLE. Sie fasst den Katalog NICHT an: `BaukastenLader` ist eine
 * Client-Komponente, und eine KOMPONENTE ueber die RSC-Grenze zu reichen ist die
 * gewoehnliche Naht — Falle 6 betrifft WERTE aus "use client"-Modulen, nicht
 * Komponenten. Die Insel selbst wird NIRGENDS direkt importiert; nur der Lader
 * kennt sie, und er laedt sie mit `dynamic(..., { ssr: false })`
 * (`_lib/naht.test.ts`).
 *
 * ⛔ Kein `Typography.Title`, kein `Descriptions.Item` (Falle 1): natives `<h1>`
 * kommt aus `Seitenkopf`. Kein `@ant-design/icons` (Falle 7) — `showIcon` an
 * `Alert` ist keiner, das Zeichen kommt aus antds eigenem Bundle.
 *
 * DER VORBEHALT KOMMT AUS `_lib/vorbehalt.ts`, nicht als abgeschriebener Satz:
 * eine zweite Fassung liefe von der auf der Startseite und auf `/lernen`
 * auseinander, und kein Tor saehe es.
 *
 * DIE VERDRAHTUNG DER BAUUEBUNG AN EIN LERNSET (Aufgabe 8, Spec §6.5): dieselbe
 * `?set=<slug>`-URL wie auf `/lernen`. Die IDs werden HIER, serverseitig, ueber
 * `idsAusSet` aufgeloest und als SERIALISIERBARES Array (`readonly string[]`) an
 * `BaukastenLader` gereicht — eine Liste von Zeichenketten ueberquert die
 * RSC-Grenze ohne Weiteres, anders als eine Funktion (Falle 9). Ein unbekannter
 * oder nicht mehr aktiver Slug faellt still auf den ganzen Bestand zurueck,
 * dieselbe Regel wie auf `/lernen`.
 */
export default async function BaukastenSeite(props: { searchParams: Promise<{ set?: string }> }) {
  const { set } = await props.searchParams;
  const db = getDb();
  const sets = aktiveLernsets(db);
  const gewaehlt = set && sets.some((x) => x.slug === set) ? set : undefined;
  const nurIds = gewaehlt ? idsAusSet(db, gewaehlt) : undefined;

  return (
    <>
      <Seitenkopf
        titel="Baukasten"
        beschreibung="Ein Zeichen zusammenstellen, herunterladen und speichern."
      />
      {/* `type="warning"`, nie `type="error"` — Falle 3. */}
      <Alert
        type="warning"
        showIcon
        style={{ marginBlockEnd: SPACE.lg }}
        title={<span data-testid="zeichen-vorbehalt">{VORBEHALT.titel}</span>}
        description={VORBEHALT.text}
      />
      <Card>
        <BaukastenLader nurIds={nurIds} />
      </Card>
    </>
  );
}
